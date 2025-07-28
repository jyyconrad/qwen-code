/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  OAuth2Client,
  Credentials,
  Compute,
  CodeChallengeMethod,
} from 'google-auth-library';
import * as http from 'http';
import url from 'url';
import crypto from 'crypto';
import * as net from 'net';
import open from 'open';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import * as os from 'os';
import { Config } from '../config/config.js';
import { getErrorMessage } from '../utils/errors.js';
import {
  cacheGoogleAccount,
  getCachedGoogleAccount,
  clearCachedGoogleAccount,
} from '../utils/user_account.js';
import { AuthType } from '../core/contentGenerator.js';
import readline from 'node:readline';

// 用于初始化 OAuth2Client 类的 OAuth 客户端 ID。
const OAUTH_CLIENT_ID =
  '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';

// 用于初始化 OAuth2Client 类的 OAuth 密钥值。
// 注意：可以将其保存在 Git 中，因为这是一个已安装的应用程序，
// 如此处所述：https://developers.google.com/identity/protocols/oauth2#installed
// “该过程会生成客户端 ID，在某些情况下还会生成客户端密钥，
// 您可以将其嵌入到应用程序的源代码中。（在这种情况下，
// 客户端密钥显然不被视为机密。）”
const OAUTH_CLIENT_SECRET = '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';

// Cloud Code 授权的 OAuth 范围。
const OAUTH_SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const HTTP_REDIRECT = 301;
const SIGN_IN_SUCCESS_URL =
  'https://developers.google.com/gemini-code-assist/auth_success_gemini';
const SIGN_IN_FAILURE_URL =
  'https://developers.google.com/gemini-code-assist/auth_failure_gemini';

const GEMINI_DIR = '.iflycode';
const CREDENTIAL_FILENAME = 'oauth_creds.json';

/**
 * 一个用于更新 Oauth2Client 凭据的认证 URL，
 * 以及一个在凭据刷新完成时解析的 Promise（或在刷新凭据失败时抛出错误）。
 */
export interface OauthWebLogin {
  authUrl: string;
  loginCompletePromise: Promise<void>;
}

export async function getOauthClient(
  authType: AuthType,
  config: Config,
): Promise<OAuth2Client> {
  const client = new OAuth2Client({
    clientId: OAUTH_CLIENT_ID,
    clientSecret: OAUTH_CLIENT_SECRET,
  });

  client.on('tokens', async (tokens: Credentials) => {
    await cacheCredentials(tokens);
  });

  // 如果磁盘上有缓存的凭据，则始终优先使用
  if (await loadCachedCredentials(client)) {
    // 找到有效的缓存凭据。
    // 检查是否需要获取 Google 账户 ID 或邮箱
    if (!getCachedGoogleAccount()) {
      try {
        await fetchAndCacheUserInfo(client);
      } catch {
        // 非致命错误，继续使用现有认证。
      }
    }
    console.log('已加载缓存凭据。');
    return client;
  }

  // 在 Google Cloud Shell 中，我们可以使用通过其元数据服务器提供的
  // 应用默认凭据 (ADC) 来使用登录到 Cloud Shell 的用户身份进行非交互式认证。
  if (authType === AuthType.CLOUD_SHELL) {
    try {
      console.log("正在尝试通过 Cloud Shell VM 的 ADC 进行认证。");
      const computeClient = new Compute({
        // 可以留空，因为元数据服务器将提供服务账户邮箱。
      });
      await computeClient.getAccessToken();
      console.log('认证成功。');

      // 在这种情况下不缓存凭据；注意 Compute 客户端将处理自己的刷新
      return computeClient;
    } catch (e) {
      throw new Error(
        `无法使用 Cloud Shell 凭据进行认证。请选择其他认证方法或确保您在正确配置的环境中。错误：${getErrorMessage(
          e,
        )}`,
      );
    }
  }

  if (config.getNoBrowser()) {
    let success = false;
    const maxRetries = 2;
    for (let i = 0; !success && i < maxRetries; i++) {
      success = await authWithUserCode(client);
      if (!success) {
        console.error(
          '\n使用用户代码认证失败。',
          i === maxRetries - 1 ? '' : '正在重试...\n',
        );
      }
    }
    if (!success) {
      process.exit(1);
    }
  } else {
    const webLogin = await authWithWeb(client);

    // 这基本上什么都不做，因为它不会显示给用户。
    console.log(
      `\n\nCode Assist 需要登录。\n` +
        `正在尝试在浏览器中打开认证页面。\n` +
        `或者导航到：\n\n${webLogin.authUrl}\n\n`,
    );
    await open(webLogin.authUrl);
    console.log('正在等待认证...');

    await webLogin.loginCompletePromise;
  }

  return client;
}

async function authWithUserCode(client: OAuth2Client): Promise<boolean> {
  const redirectUri = 'https://sdk.cloud.google.com/authcode_cloudcode.html';
  const codeVerifier = await client.generateCodeVerifierAsync();
  const state = crypto.randomBytes(32).toString('hex');
  const authUrl: string = client.generateAuthUrl({
    redirect_uri: redirectUri,
    access_type: 'offline',
    scope: OAUTH_SCOPE,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: codeVerifier.codeChallenge,
    state,
  });
  console.log('请访问以下 URL 来授权应用程序：');
  console.log('');
  console.log(authUrl);
  console.log('');

  const code = await new Promise<string>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('输入授权代码：', (code) => {
      rl.close();
      resolve(code.trim());
    });
  });

  if (!code) {
    console.error('需要授权代码。');
    return false;
  }

  try {
    const { tokens } = await client.getToken({
      code,
      codeVerifier: codeVerifier.codeVerifier,
      redirect_uri: redirectUri,
    });
    client.setCredentials(tokens);
  } catch (_error) {
    return false;
  }
  return true;
}

async function authWithWeb(client: OAuth2Client): Promise<OauthWebLogin> {
  const port = await getAvailablePort();
  const redirectUri = `http://localhost:${port}/oauth2callback`;
  const state = crypto.randomBytes(32).toString('hex');
  const authUrl = client.generateAuthUrl({
    redirect_uri: redirectUri,
    access_type: 'offline',
    scope: OAUTH_SCOPE,
    state,
  });

  const loginCompletePromise = new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (req.url!.indexOf('/oauth2callback') === -1) {
          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_FAILURE_URL });
          res.end();
          reject(new Error('意外请求：' + req.url));
        }
        // 从查询字符串中获取代码，并关闭 Web 服务器。
        const qs = new url.URL(req.url!, 'http://localhost:3000').searchParams;
        if (qs.get('error')) {
          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_FAILURE_URL });
          res.end();

          reject(new Error(`认证期间出错：${qs.get('error')}`));
        } else if (qs.get('state') !== state) {
          res.end('状态不匹配。可能的 CSRF 攻击');

          reject(new Error('状态不匹配。可能的 CSRF 攻击'));
        } else if (qs.get('code')) {
          const { tokens } = await client.getToken({
            code: qs.get('code')!,
            redirect_uri: redirectUri,
          });
          client.setCredentials(tokens);
          // 在认证期间检索并缓存 Google 账户 ID
          try {
            await fetchAndCacheUserInfo(client);
          } catch (error) {
            console.error(
              '认证期间检索 Google 账户 ID 失败：',
              error,
            );
            // 如果 Google 账户 ID 检索失败，不要使认证流程失败
          }

          res.writeHead(HTTP_REDIRECT, { Location: SIGN_IN_SUCCESS_URL });
          res.end();
          resolve();
        } else {
          reject(new Error('请求中未找到代码'));
        }
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
    server.listen(port);
  });

  return {
    authUrl,
    loginCompletePromise,
  };
}

export function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = 0;
    try {
      const server = net.createServer();
      server.listen(0, () => {
        const address = server.address()! as net.AddressInfo;
        port = address.port;
      });
      server.on('listening', () => {
        server.close();
        server.unref();
      });
      server.on('error', (e) => reject(e));
      server.on('close', () => resolve(port));
    } catch (e) {
      reject(e);
    }
  });
}

async function loadCachedCredentials(client: OAuth2Client): Promise<boolean> {
  try {
    const keyFile =
      process.env.GOOGLE_APPLICATION_CREDENTIALS || getCachedCredentialPath();

    const creds = await fs.readFile(keyFile, 'utf-8');
    client.setCredentials(JSON.parse(creds));

    // 这将在本地验证凭据是否看起来正常。
    const { token } = await client.getAccessToken();
    if (!token) {
      return false;
    }

    // 这将与服务器检查以查看凭据是否未被撤销。
    await client.getTokenInfo(token);

    return true;
  } catch (_) {
    return false;
  }
}

async function cacheCredentials(credentials: Credentials) {
  const filePath = getCachedCredentialPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const credString = JSON.stringify(credentials, null, 2);
  await fs.writeFile(filePath, credString);
}

function getCachedCredentialPath(): string {
  return path.join(os.homedir(), GEMINI_DIR, CREDENTIAL_FILENAME);
}

export async function clearCachedCredentialFile() {
  try {
    await fs.rm(getCachedCredentialPath(), { force: true });
    // 清除凭据时清除 Google 账户 ID 缓存
    await clearCachedGoogleAccount();
  } catch (_) {
    /* empty */
  }
}

async function fetchAndCacheUserInfo(client: OAuth2Client): Promise<void> {
  try {
    const { token } = await client.getAccessToken();
    if (!token) {
      return;
    }

    const response = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      console.error(
        '获取用户信息失败：',
        response.status,
        response.statusText,
      );
      return;
    }

    const userInfo = await response.json();
    if (userInfo.email) {
      await cacheGoogleAccount(userInfo.email);
    }
  } catch (error) {
    console.error('检索用户信息时出错：', error);
  }
}