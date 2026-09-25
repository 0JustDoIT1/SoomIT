import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RespiratorySettingsPage from './page';

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../_components/respiratory-auth-provider', () => ({
  useRespiratoryAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

vi.mock('@/components/ui/toast/toast', () => ({
  showToast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const profile = {
  name: '호흡기 의사',
  username: 'doctor',
  department: { name: '호흡기내과' },
  hospital: { name: 'SoomIT 병원' },
  role: 'DOCTOR',
  doctor_profile: {},
};

function installApi(
  stored: Record<'EXAMINATION_ORDER' | 'CASE_CHAT', boolean>,
  options: { failNextPatch?: boolean; pendingPatch?: Promise<Response> } = {},
) {
  let failNextPatch = options.failNextPatch ?? false;
  mocks.authorizedFetch.mockImplementation(async (input: string, init?: RequestInit) => {
    if (input.includes('/api/auth/staff/profile/')) {
      return jsonResponse(profile);
    }
    if (init?.method === 'PATCH') {
      if (options.pendingPatch) return options.pendingPatch;
      const setting = JSON.parse(String(init.body)) as {
        notification_type: 'EXAMINATION_ORDER' | 'CASE_CHAT';
        enabled: boolean;
      };
      if (failNextPatch) {
        failNextPatch = false;
        return jsonResponse({ detail: 'server detail' }, false);
      }
      stored[setting.notification_type] = setting.enabled;
      return jsonResponse(setting);
    }
    const notificationType = new URL(input).searchParams.get(
      'notification_type',
    ) as 'EXAMINATION_ORDER' | 'CASE_CHAT';
    return jsonResponse({
      notification_type: notificationType,
      enabled: stored[notificationType],
    });
  });
}

async function loadedControls() {
  const order = await screen.findByRole('checkbox', { name: /검사 오더 알림/ });
  const chat = screen.getByRole('checkbox', { name: /개인 Case 메시지 알림/ });
  const save = screen.getByRole('button', { name: '알림 설정 저장' });
  await waitFor(() => expect(order).not.toBeDisabled());
  return { order, chat, save };
}

describe('profile notification settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.dataset.theme = 'light';
  });

  it('loads the current user settings and avoids an unchanged save', async () => {
    installApi({ EXAMINATION_ORDER: true, CASE_CHAT: false });
    render(<RespiratorySettingsPage />);

    const { order, chat, save } = await loadedControls();
    expect(order).toBeChecked();
    expect(chat).not.toBeChecked();
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(mocks.authorizedFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/notifications/me/settings/'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('saves only the changed toggle and shows one success toast', async () => {
    const stored = { EXAMINATION_ORDER: true, CASE_CHAT: true };
    installApi(stored);
    render(<RespiratorySettingsPage />);
    const { order, save } = await loadedControls();

    fireEvent.click(order);
    fireEvent.click(save);

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      '알림 설정이 저장되었습니다.',
      { id: 'notification-settings-save' },
    );
    expect(stored.EXAMINATION_ORDER).toBe(false);
    expect(save).toBeDisabled();
    expect(
      mocks.authorizedFetch.mock.calls.filter(([, init]) => init?.method === 'PATCH'),
    ).toHaveLength(1);
  });

  it('blocks rapid duplicate saves while the request is pending', async () => {
    let resolvePatch!: (response: Response) => void;
    const pendingPatch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    installApi(
      { EXAMINATION_ORDER: true, CASE_CHAT: true },
      { pendingPatch },
    );
    render(<RespiratorySettingsPage />);
    const { order, save } = await loadedControls();
    fireEvent.click(order);

    fireEvent.click(save);
    fireEvent.click(save);
    expect(screen.getByRole('button', { name: '저장 중...' })).toBeDisabled();
    expect(
      mocks.authorizedFetch.mock.calls.filter(([, init]) => init?.method === 'PATCH'),
    ).toHaveLength(1);

    await act(async () => {
      resolvePatch(jsonResponse({
        notification_type: 'EXAMINATION_ORDER',
        enabled: false,
      }));
      await pendingPatch;
    });
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
  });

  it('keeps the edited value after failure and permits a successful retry', async () => {
    const stored = { EXAMINATION_ORDER: true, CASE_CHAT: true };
    installApi(stored, { failNextPatch: true });
    render(<RespiratorySettingsPage />);
    const { order, save } = await loadedControls();
    fireEvent.click(order);
    fireEvent.click(save);

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(order).not.toBeChecked();
    expect(save).not.toBeDisabled();

    fireEvent.click(save);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledTimes(1));
    expect(stored.EXAMINATION_ORDER).toBe(false);
  });

  it('restores the saved value when the page is opened again', async () => {
    const stored = { EXAMINATION_ORDER: true, CASE_CHAT: true };
    installApi(stored);
    const first = render(<RespiratorySettingsPage />);
    const { order, save } = await loadedControls();
    fireEvent.click(order);
    fireEvent.click(save);
    await waitFor(() => expect(stored.EXAMINATION_ORDER).toBe(false));
    first.unmount();

    render(<RespiratorySettingsPage />);
    expect(await screen.findByRole('checkbox', { name: /검사 오더 알림/ })).not.toBeChecked();
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('keeps the controls usable with the shared dark theme active', async () => {
    document.documentElement.dataset.theme = 'dark';
    installApi({ EXAMINATION_ORDER: true, CASE_CHAT: true });
    render(<RespiratorySettingsPage />);

    const { order, save } = await loadedControls();
    fireEvent.click(order);
    expect(save).not.toBeDisabled();
  });

  it('emits only the completed result toast after navigating away mid-save', async () => {
    let resolvePatch!: (response: Response) => void;
    const pendingPatch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    installApi(
      { EXAMINATION_ORDER: true, CASE_CHAT: true },
      { pendingPatch },
    );
    const view = render(<RespiratorySettingsPage />);
    const { order, save } = await loadedControls();
    fireEvent.click(order);
    fireEvent.click(save);
    view.unmount();

    await act(async () => {
      resolvePatch(jsonResponse({
        notification_type: 'EXAMINATION_ORDER',
        enabled: false,
      }));
      await pendingPatch;
    });

    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
