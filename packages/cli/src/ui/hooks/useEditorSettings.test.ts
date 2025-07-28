/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockedFunction,
} from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useEditorSettings } from './useEditorSettings.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { MessageType, type HistoryItem } from '../types.js';
import {
  type EditorType,
  checkHasEditorType,
  allowEditorTypeInSandbox,
} from '@iflytek/iflycode-core';

vi.mock('@iflytek/iflycode-core', async () => {
  const actual = await vi.importActual('@iflytek/iflycode-core');
  return {
    ...actual,
    checkHasEditorType: vi.fn(() => true),
    allowEditorTypeInSandbox: vi.fn(() => true),
  };
});

const mockCheckHasEditorType = vi.mocked(checkHasEditorType);
const mockAllowEditorTypeInSandbox = vi.mocked(allowEditorTypeInSandbox);

describe('useEditorSettings', () => {
  let mockLoadedSettings: LoadedSettings;
  let mockSetEditorError: MockedFunction<(error: string | null) => void>;
  let mockAddItem: MockedFunction<
    (item: Omit<HistoryItem, 'id'>, timestamp: number) => void
  >;

  beforeEach(() => {
    vi.resetAllMocks();

    mockLoadedSettings = {
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    mockSetEditorError = vi.fn();
    mockAddItem = vi.fn();

    // 重置模拟实现为默认值
    mockCheckHasEditorType.mockReturnValue(true);
    mockAllowEditorTypeInSandbox.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应初始化为对话框关闭状态', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    expect(result.current.isEditorDialogOpen).toBe(false);
  });

  it('调用 openEditorDialog 时应打开编辑器对话框', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    act(() => {
      result.current.openEditorDialog();
    });

    expect(result.current.isEditorDialogOpen).toBe(true);
  });

  it('调用 exitEditorDialog 时应关闭编辑器对话框', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );
    act(() => {
      result.current.openEditorDialog();
      result.current.exitEditorDialog();
    });
    expect(result.current.isEditorDialogOpen).toBe(false);
  });

  it('应成功处理编辑器选择', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    const editorType: EditorType = 'vscode';
    const scope = SettingScope.User;

    act(() => {
      result.current.openEditorDialog();
      result.current.handleEditorSelect(editorType, scope);
    });

    expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
      scope,
      'preferredEditor',
      editorType,
    );

    expect(mockAddItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: '编辑器偏好已设置为 "vscode"（用户设置）。',
      },
      expect.any(Number),
    );

    expect(mockSetEditorError).toHaveBeenCalledWith(null);
    expect(result.current.isEditorDialogOpen).toBe(false);
  });

  it('应处理清除编辑器偏好（未定义的编辑器）', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    const scope = SettingScope.Workspace;

    act(() => {
      result.current.openEditorDialog();
      result.current.handleEditorSelect(undefined, scope);
    });

    expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
      scope,
      'preferredEditor',
      undefined,
    );

    expect(mockAddItem).toHaveBeenCalledWith(
      {
        type: MessageType.INFO,
        text: '工作区设置中的编辑器偏好已清除。',
      },
      expect.any(Number),
    );

    expect(mockSetEditorError).toHaveBeenCalledWith(null);
    expect(result.current.isEditorDialogOpen).toBe(false);
  });

  it('应处理不同的编辑器类型', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    const editorTypes: EditorType[] = ['cursor', 'windsurf', 'vim'];
    const scope = SettingScope.User;

    editorTypes.forEach((editorType) => {
      act(() => {
        result.current.handleEditorSelect(editorType, scope);
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        scope,
        'preferredEditor',
        editorType,
      );

      expect(mockAddItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: `编辑器偏好已设置为 "${editorType}"（用户设置）。`,
        },
        expect.any(Number),
      );
    });
  });

  it('应处理不同的设置范围', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    const editorType: EditorType = 'vscode';
    const scopes = [SettingScope.User, SettingScope.Workspace];

    scopes.forEach((scope) => {
      act(() => {
        result.current.handleEditorSelect(editorType, scope);
      });

      expect(mockLoadedSettings.setValue).toHaveBeenCalledWith(
        scope,
        'preferredEditor',
        editorType,
      );

      expect(mockAddItem).toHaveBeenCalledWith(
        {
          type: MessageType.INFO,
          text: `编辑器偏好已设置为 "vscode"（${scope} 设置）。`,
        },
        expect.any(Number),
      );
    });
  });

  it('不应为不可用的编辑器设置偏好', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    mockCheckHasEditorType.mockReturnValue(false);

    const editorType: EditorType = 'vscode';
    const scope = SettingScope.User;

    act(() => {
      result.current.openEditorDialog();
      result.current.handleEditorSelect(editorType, scope);
    });

    expect(mockLoadedSettings.setValue).not.toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(result.current.isEditorDialogOpen).toBe(true);
  });

  it('不应为沙箱中不允许的编辑器设置偏好', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    mockAllowEditorTypeInSandbox.mockReturnValue(false);

    const editorType: EditorType = 'vscode';
    const scope = SettingScope.User;

    act(() => {
      result.current.openEditorDialog();
      result.current.handleEditorSelect(editorType, scope);
    });

    expect(mockLoadedSettings.setValue).not.toHaveBeenCalled();
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(result.current.isEditorDialogOpen).toBe(true);
  });

  it('应处理编辑器选择期间的错误', () => {
    const { result } = renderHook(() =>
      useEditorSettings(mockLoadedSettings, mockSetEditorError, mockAddItem),
    );

    const errorMessage = '保存设置失败';
    (
      mockLoadedSettings.setValue as MockedFunction<
        typeof mockLoadedSettings.setValue
      >
    ).mockImplementation(() => {
      throw new Error(errorMessage);
    });

    const editorType: EditorType = 'vscode';
    const scope = SettingScope.User;

    act(() => {
      result.current.openEditorDialog();
      result.current.handleEditorSelect(editorType, scope);
    });

    expect(mockSetEditorError).toHaveBeenCalledWith(
      `设置编辑器偏好失败: Error: ${errorMessage}`,
    );
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(result.current.isEditorDialogOpen).toBe(true);
  });
});