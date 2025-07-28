/**
 * @license
 * 版权所有 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest/globals" />

// 首先模拟 'os' 模块。
import * as osActual from 'os'; // 导入以获取模拟工厂的类型信息
vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof osActual>();
  return {
    ...actualOs,
    homedir: vi.fn(() => '/mock/home/user'),
    platform: vi.fn(() => 'linux'),
  };
});

// 模拟 './settings.js' 以确保其内部常量使用模拟的 'os.homedir()'。
vi.mock('./settings.js', async (importActual) => {
  const originalModule = await importActual<typeof import('./settings.js')>();
  return {
    __esModule: true, // 确保正确的模块结构
    ...originalModule, // 重新导出所有原始成员
    // 我们依赖 originalModule 的 USER_SETTINGS_PATH 是使用模拟的 os.homedir() 构建的
  };
});

// 现在导入其他所有内容，包括（现在实际上是重新导出的）settings.js
import * as pathActual from 'path'; // 为 MOCK_WORKSPACE_SETTINGS_PATH 恢复
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mocked,
  type Mock,
} from 'vitest';
import * as fs from 'fs'; // fs 将被单独模拟
import stripJsonComments from 'strip-json-comments'; // 将被单独模拟

// 这些导入将从 vi.mock('./settings.js', ...) 工厂获取版本。
import {
  loadSettings,
  USER_SETTINGS_PATH, // 这是模拟的路径。
  SYSTEM_SETTINGS_PATH,
  SETTINGS_DIRECTORY_NAME, // 这来自原始模块，但被模拟使用。
  SettingScope,
} from './settings.js';

const MOCK_WORKSPACE_DIR = '/mock/workspace';
// 使用（模拟的）SETTINGS_DIRECTORY_NAME 以保持一致性
const MOCK_WORKSPACE_SETTINGS_PATH = pathActual.join(
  MOCK_WORKSPACE_DIR,
  SETTINGS_DIRECTORY_NAME,
  'settings.json',
);

vi.mock('fs');
vi.mock('strip-json-comments', () => ({
  default: vi.fn((content) => content),
}));

describe('设置加载和合并', () => {
  let mockFsExistsSync: Mocked<typeof fs.existsSync>;
  let mockStripJsonComments: Mocked<typeof stripJsonComments>;
  let mockFsMkdirSync: Mocked<typeof fs.mkdirSync>;

  beforeEach(() => {
    vi.resetAllMocks();

    mockFsExistsSync = vi.mocked(fs.existsSync);
    mockFsMkdirSync = vi.mocked(fs.mkdirSync);
    mockStripJsonComments = vi.mocked(stripJsonComments);

    vi.mocked(osActual.homedir).mockReturnValue('/mock/home/user');
    (mockStripJsonComments as unknown as Mock).mockImplementation(
      (jsonString: string) => jsonString,
    );
    (mockFsExistsSync as Mock).mockReturnValue(false);
    (fs.readFileSync as Mock).mockReturnValue('{}'); // 返回有效的空 JSON
    (mockFsMkdirSync as Mock).mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadSettings', () => {
    it('如果不存在任何文件，应加载空设置', () => {
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.system.settings).toEqual({});
      expect(settings.user.settings).toEqual({});
      expect(settings.workspace.settings).toEqual({});
      expect(settings.merged).toEqual({});
      expect(settings.errors.length).toBe(0);
    });

    it('如果只有系统文件存在，应加载系统设置', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === SYSTEM_SETTINGS_PATH,
      );
      const systemSettingsContent = {
        theme: 'system-default',
        sandbox: false,
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === SYSTEM_SETTINGS_PATH)
            return JSON.stringify(systemSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        SYSTEM_SETTINGS_PATH,
        'utf-8',
      );
      expect(settings.system.settings).toEqual(systemSettingsContent);
      expect(settings.user.settings).toEqual({});
      expect(settings.workspace.settings).toEqual({});
      expect(settings.merged).toEqual(systemSettingsContent);
    });

    it('如果只有用户文件存在，应加载用户设置', () => {
      const expectedUserSettingsPath = USER_SETTINGS_PATH; // 使用由（模拟的）模块实际解析的路径

      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === expectedUserSettingsPath,
      );
      const userSettingsContent = {
        theme: 'dark',
        contextFileName: 'USER_CONTEXT.md',
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === expectedUserSettingsPath)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expectedUserSettingsPath,
        'utf-8',
      );
      expect(settings.user.settings).toEqual(userSettingsContent);
      expect(settings.workspace.settings).toEqual({});
      expect(settings.merged).toEqual(userSettingsContent);
    });

    it('如果只有工作区文件存在，应加载工作区设置', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const workspaceSettingsContent = {
        sandbox: true,
        contextFileName: 'WORKSPACE_CONTEXT.md',
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        MOCK_WORKSPACE_SETTINGS_PATH,
        'utf-8',
      );
      expect(settings.user.settings).toEqual({});
      expect(settings.workspace.settings).toEqual(workspaceSettingsContent);
      expect(settings.merged).toEqual(workspaceSettingsContent);
    });

    it('应合并用户和工作区设置，工作区优先', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = {
        theme: 'dark',
        sandbox: false,
        contextFileName: 'USER_CONTEXT.md',
      };
      const workspaceSettingsContent = {
        sandbox: true,
        coreTools: ['tool1'],
        contextFileName: 'WORKSPACE_CONTEXT.md',
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.user.settings).toEqual(userSettingsContent);
      expect(settings.workspace.settings).toEqual(workspaceSettingsContent);
      expect(settings.merged).toEqual({
        theme: 'dark',
        sandbox: true,
        coreTools: ['tool1'],
        contextFileName: 'WORKSPACE_CONTEXT.md',
      });
    });

    it('应合并系统、用户和工作区设置，系统优先于工作区，工作区优先于用户', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const systemSettingsContent = {
        theme: 'system-theme',
        sandbox: false,
        telemetry: { enabled: false },
      };
      const userSettingsContent = {
        theme: 'dark',
        sandbox: true,
        contextFileName: 'USER_CONTEXT.md',
      };
      const workspaceSettingsContent = {
        sandbox: false,
        coreTools: ['tool1'],
        contextFileName: 'WORKSPACE_CONTEXT.md',
      };

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === SYSTEM_SETTINGS_PATH)
            return JSON.stringify(systemSettingsContent);
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.system.settings).toEqual(systemSettingsContent);
      expect(settings.user.settings).toEqual(userSettingsContent);
      expect(settings.workspace.settings).toEqual(workspaceSettingsContent);
      expect(settings.merged).toEqual({
        theme: 'system-theme',
        sandbox: false,
        telemetry: { enabled: false },
        coreTools: ['tool1'],
        contextFileName: 'WORKSPACE_CONTEXT.md',
      });
    });

    it('当仅在用户设置中存在 contextFileName 时，应正确处理', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const userSettingsContent = { contextFileName: 'CUSTOM.md' };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.contextFileName).toBe('CUSTOM.md');
    });

    it('当仅在工作区设置中存在 contextFileName 时，应正确处理', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const workspaceSettingsContent = {
        contextFileName: 'PROJECT_SPECIFIC.md',
      };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.contextFileName).toBe('PROJECT_SPECIFIC.md');
    });

    it('如果任何设置文件中都不存在 contextFileName，则默认为 undefined', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = { theme: 'dark' };
      const workspaceSettingsContent = { sandbox: true };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.contextFileName).toBeUndefined();
    });

    it('应从用户设置加载遥测设置', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      const userSettingsContent = { telemetry: true };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.telemetry).toBe(true);
    });

    it('应从工作区设置加载遥测设置', () => {
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      const workspaceSettingsContent = { telemetry: false };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.telemetry).toBe(false);
    });

    it('应优先使用工作区遥测设置而非用户设置', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true);
      const userSettingsContent = { telemetry: true };
      const workspaceSettingsContent = { telemetry: false };
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.telemetry).toBe(false);
    });

    it('如果任何设置文件中都不存在遥测设置，则应为 undefined', () => {
      (mockFsExistsSync as Mock).mockReturnValue(false); // 不存在设置文件
      (fs.readFileSync as Mock).mockReturnValue('{}');
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.merged.telemetry).toBeUndefined();
    });

    it('应优雅地处理 JSON 解析错误', () => {
      (mockFsExistsSync as Mock).mockReturnValue(true); // 两个文件都“存在”
      const invalidJsonContent = 'invalid json';
      const userReadError = new SyntaxError(
        "Expected ',' or '}' after property value in JSON at position 10",
      );
      const workspaceReadError = new SyntaxError(
        'Unexpected token i in JSON at position 0',
      );

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH) {
            // 模拟 JSON.parse 在用户设置中抛出异常
            vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
              throw userReadError;
            });
            return invalidJsonContent; // 会导致 JSON.parse 抛出异常的内容
          }
          if (p === MOCK_WORKSPACE_SETTINGS_PATH) {
            // 模拟 JSON.parse 在工作区设置中抛出异常
            vi.spyOn(JSON, 'parse').mockImplementationOnce(() => {
              throw workspaceReadError;
            });
            return invalidJsonContent;
          }
          return '{}'; // 其他读取的默认值
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      // 检查由于解析错误设置是否为空
      expect(settings.user.settings).toEqual({});
      expect(settings.workspace.settings).toEqual({});
      expect(settings.merged).toEqual({});

      // 检查 settings.errors 中是否填充了错误对象
      expect(settings.errors).toBeDefined();
      // 假设用户和工作区文件都会导致错误，并按顺序添加
      expect(settings.errors.length).toEqual(2);

      const userError = settings.errors.find(
        (e) => e.path === USER_SETTINGS_PATH,
      );
      expect(userError).toBeDefined();
      expect(userError?.message).toBe(userReadError.message);

      const workspaceError = settings.errors.find(
        (e) => e.path === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      expect(workspaceError).toBeDefined();
      expect(workspaceError?.message).toBe(workspaceReadError.message);

      // 如果为此测试专门监视了 JSON.parse，则恢复它
      vi.restoreAllMocks(); // 或者如果需要更精确的恢复
    });

    it('应解析用户设置中的环境变量', () => {
      process.env.TEST_API_KEY = 'user_api_key_from_env';
      const userSettingsContent = {
        apiKey: '$TEST_API_KEY',
        someUrl: 'https://test.com/${TEST_API_KEY}',
      };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.user.settings.apiKey).toBe('user_api_key_from_env');
      expect(settings.user.settings.someUrl).toBe(
        'https://test.com/user_api_key_from_env',
      );
      expect(settings.merged.apiKey).toBe('user_api_key_from_env');
      delete process.env.TEST_API_KEY;
    });

    it('应解析工作区设置中的环境变量', () => {
      process.env.WORKSPACE_ENDPOINT = 'workspace_endpoint_from_env';
      const workspaceSettingsContent = {
        endpoint: '${WORKSPACE_ENDPOINT}/api',
        nested: { value: '$WORKSPACE_ENDPOINT' },
      };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === MOCK_WORKSPACE_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === MOCK_WORKSPACE_SETTINGS_PATH)
            return JSON.stringify(workspaceSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.workspace.settings.endpoint).toBe(
        'workspace_endpoint_from_env/api',
      );
      expect(settings.workspace.settings.nested.value).toBe(
        'workspace_endpoint_from_env',
      );
      expect(settings.merged.endpoint).toBe('workspace_endpoint_from_env/api');
      delete process.env.WORKSPACE_ENDPOINT;
    });

    it('如果解析后键冲突，应优先使用用户环境变量而非工作区环境变量', () => {
      const userSettingsContent = { configValue: '$SHARED_VAR' };
      const workspaceSettingsContent = { configValue: '$SHARED_VAR' };

      (mockFsExistsSync as Mock).mockReturnValue(true);
      const originalSharedVar = process.env.SHARED_VAR;
      // 暂时删除以确保测试操作的干净环境
      delete process.env.SHARED_VAR;

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH) {
            process.env.SHARED_VAR = 'user_value_for_user_read'; // 为用户设置读取设置
            return JSON.stringify(userSettingsContent);
          }
          if (p === MOCK_WORKSPACE_SETTINGS_PATH) {
            process.env.SHARED_VAR = 'workspace_value_for_workspace_read'; // 为工作区设置读取设置
            return JSON.stringify(workspaceSettingsContent);
          }
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.user.settings.configValue).toBe(
        'user_value_for_user_read',
      );
      expect(settings.workspace.settings.configValue).toBe(
        'workspace_value_for_workspace_read',
      );
      // 合并值应采用工作区的解析值
      expect(settings.merged.configValue).toBe(
        'workspace_value_for_workspace_read',
      );

      // 恢复原始环境变量状态
      if (originalSharedVar !== undefined) {
        process.env.SHARED_VAR = originalSharedVar;
      } else {
        delete process.env.SHARED_VAR; // 如果之前不存在则确保删除
      }
    });

    it('如果解析后键冲突，应优先使用工作区环境变量而非用户环境变量', () => {
      const userSettingsContent = { configValue: '$SHARED_VAR' };
      const workspaceSettingsContent = { configValue: '$SHARED_VAR' };

      (mockFsExistsSync as Mock).mockReturnValue(true);
      const originalSharedVar = process.env.SHARED_VAR;
      // 暂时删除以确保测试操作的干净环境
      delete process.env.SHARED_VAR;

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH) {
            process.env.SHARED_VAR = 'user_value_for_user_read'; // 为用户设置读取设置
            return JSON.stringify(userSettingsContent);
          }
          if (p === MOCK_WORKSPACE_SETTINGS_PATH) {
            process.env.SHARED_VAR = 'workspace_value_for_workspace_read'; // 为工作区设置读取设置
            return JSON.stringify(workspaceSettingsContent);
          }
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.user.settings.configValue).toBe(
        'user_value_for_user_read',
      );
      expect(settings.workspace.settings.configValue).toBe(
        'workspace_value_for_workspace_read',
      );
      // 合并值应采用工作区的解析值
      expect(settings.merged.configValue).toBe(
        'workspace_value_for_workspace_read',
      );

      // 恢复原始环境变量状态
      if (originalSharedVar !== undefined) {
        process.env.SHARED_VAR = originalSharedVar;
      } else {
        delete process.env.SHARED_VAR; // 如果之前不存在则确保删除
      }
    });

    it('如果解析后键冲突，应优先使用系统环境变量而非工作区环境变量', () => {
      const workspaceSettingsContent = { configValue: '$SHARED_VAR' };
      const systemSettingsContent = { configValue: '$SHARED_VAR' };

      (mockFsExistsSync as Mock).mockReturnValue(true);
      const originalSharedVar = process.env.SHARED_VAR;
      // 暂时删除以确保测试操作的干净环境
      delete process.env.SHARED_VAR;

      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === SYSTEM_SETTINGS_PATH) {
            process.env.SHARED_VAR = 'system_value_for_system_read'; // 为系统设置读取设置
            return JSON.stringify(systemSettingsContent);
          }
          if (p === MOCK_WORKSPACE_SETTINGS_PATH) {
            process.env.SHARED_VAR = 'workspace_value_for_workspace_read'; // 为工作区设置读取设置
            return JSON.stringify(workspaceSettingsContent);
          }
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.system.settings.configValue).toBe(
        'system_value_for_system_read',
      );
      expect(settings.workspace.settings.configValue).toBe(
        'workspace_value_for_workspace_read',
      );
      // 合并值应采用系统解析值
      expect(settings.merged.configValue).toBe('system_value_for_system_read');

      // 恢复原始环境变量状态
      if (originalSharedVar !== undefined) {
        process.env.SHARED_VAR = originalSharedVar;
      } else {
        delete process.env.SHARED_VAR; // 如果之前不存在则确保删除
      }
    });

    it('应保留未解析的环境变量原样', () => {
      const userSettingsContent = { apiKey: '$UNDEFINED_VAR' };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.user.settings.apiKey).toBe('$UNDEFINED_VAR');
      expect(settings.merged.apiKey).toBe('$UNDEFINED_VAR');
    });

    it('应解析单个字符串中的多个环境变量', () => {
      process.env.VAR_A = 'valueA';
      process.env.VAR_B = 'valueB';
      const userSettingsContent = { path: '/path/$VAR_A/${VAR_B}/end' };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.user.settings.path).toBe('/path/valueA/valueB/end');
      delete process.env.VAR_A;
      delete process.env.VAR_B;
    });

    it('应解析数组中的环境变量', () => {
      process.env.ITEM_1 = 'item1_env';
      process.env.ITEM_2 = 'item2_env';
      const userSettingsContent = { list: ['$ITEM_1', '${ITEM_2}', 'literal'] };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );
      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.user.settings.list).toEqual([
        'item1_env',
        'item2_env',
        'literal',
      ]);
      delete process.env.ITEM_1;
      delete process.env.ITEM_2;
    });

    it('应正确传递 null、boolean 和 number 类型，并处理 undefined 属性', () => {
      process.env.MY_ENV_STRING = 'env_string_value';
      process.env.MY_ENV_STRING_NESTED = 'env_string_nested_value';

      const userSettingsContent = {
        nullVal: null,
        trueVal: true,
        falseVal: false,
        numberVal: 123.45,
        stringVal: '$MY_ENV_STRING',
        nestedObj: {
          nestedNull: null,
          nestedBool: true,
          nestedNum: 0,
          nestedString: 'literal',
          anotherEnv: '${MY_ENV_STRING_NESTED}',
        },
      };

      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);

      expect(settings.user.settings.nullVal).toBeNull();
      expect(settings.user.settings.trueVal).toBe(true);
      expect(settings.user.settings.falseVal).toBe(false);
      expect(settings.user.settings.numberVal).toBe(123.45);
      expect(settings.user.settings.stringVal).toBe('env_string_value');
      expect(settings.user.settings.undefinedVal).toBeUndefined();

      expect(settings.user.settings.nestedObj.nestedNull).toBeNull();
      expect(settings.user.settings.nestedObj.nestedBool).toBe(true);
      expect(settings.user.settings.nestedObj.nestedNum).toBe(0);
      expect(settings.user.settings.nestedObj.nestedString).toBe('literal');
      expect(settings.user.settings.nestedObj.anotherEnv).toBe(
        'env_string_nested_value',
      );

      delete process.env.MY_ENV_STRING;
      delete process.env.MY_ENV_STRING_NESTED;
    });

    it('应解析单个字符串值中的多个连接环境变量', () => {
      process.env.TEST_HOST = 'myhost';
      process.env.TEST_PORT = '9090';
      const userSettingsContent = {
        serverAddress: '${TEST_HOST}:${TEST_PORT}/api',
      };
      (mockFsExistsSync as Mock).mockImplementation(
        (p: fs.PathLike) => p === USER_SETTINGS_PATH,
      );
      (fs.readFileSync as Mock).mockImplementation(
        (p: fs.PathOrFileDescriptor) => {
          if (p === USER_SETTINGS_PATH)
            return JSON.stringify(userSettingsContent);
          return '{}';
        },
      );

      const settings = loadSettings(MOCK_WORKSPACE_DIR);
      expect(settings.user.settings.serverAddress).toBe('myhost:9090/api');

      delete process.env.TEST_HOST;
      delete process.env.TEST_PORT;
    });
  });

  describe('LoadedSettings 类', () => {
    it('setValue 应更新正确的范围并重新计算合并设置', () => {
      (mockFsExistsSync as Mock).mockReturnValue(false);
      const loadedSettings = loadSettings(MOCK_WORKSPACE_DIR);

      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      // mkdirSync 在 beforeEach 中被模拟为返回 undefined，这对 void 使用是正常的

      loadedSettings.setValue(SettingScope.User, 'theme', 'matrix');
      expect(loadedSettings.user.settings.theme).toBe('matrix');
      expect(loadedSettings.merged.theme).toBe('matrix');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        USER_SETTINGS_PATH,
        JSON.stringify({ theme: 'matrix' }, null, 2),
        'utf-8',
      );

      loadedSettings.setValue(
        SettingScope.Workspace,
        'contextFileName',
        'MY_AGENTS.md',
      );
      expect(loadedSettings.workspace.settings.contextFileName).toBe(
        'MY_AGENTS.md',
      );
      expect(loadedSettings.merged.contextFileName).toBe('MY_AGENTS.md');
      expect(loadedSettings.merged.theme).toBe('matrix'); // 用户设置应仍然存在
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        MOCK_WORKSPACE_SETTINGS_PATH,
        JSON.stringify({ contextFileName: 'MY_AGENTS.md' }, null, 2),
        'utf-8',
      );

      // 系统主题覆盖用户和工作区主题
      loadedSettings.setValue(SettingScope.System, 'theme', 'ocean');

      expect(loadedSettings.system.settings.theme).toBe('ocean');
      expect(loadedSettings.merged.theme).toBe('ocean');
    });
  });
});