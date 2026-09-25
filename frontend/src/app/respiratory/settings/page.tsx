'use client';

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { DayPicker } from 'react-day-picker';
import { ko } from 'react-day-picker/locale';
import { showToast } from '@/components/ui/toast/toast';
import { useRespiratoryAuth } from '../_components/respiratory-auth-provider';

const ALLOWED_PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Backend enum/values are unchanged (DoctorProfile.Gender still has
// OTHER/UNSPECIFIED) - this UI just no longer offers them as choices.
const GENDER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '미설정' },
  { value: 'MALE', label: '남' },
  { value: 'FEMALE', label: '여' },
];
const GENDER_LABELS: Record<string, string> = Object.fromEntries(
  GENDER_OPTIONS.filter((option) => option.value).map((option) => [
    option.value,
    option.label,
  ])
);

type DoctorProfileData = {
  license_number?: string;
  birth_date?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  profile_image_uri?: string | null;
  tags?: string[];
};

type Profile = {
  name: string;
  username: string;
  department?: { name?: string };
  hospital?: { name?: string };
  role?: string;
  doctor_profile?: DoctorProfileData | null;
};

const apiBase = (
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

const birthDateStartMonth = new Date(1900, 0, 1);

function parseBirthDate(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatBirthDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type NotificationType = 'EXAMINATION_ORDER' | 'CASE_CHAT';
type NotificationSetting = { notification_type: NotificationType; enabled: boolean };
type NotificationSettingsState = Record<NotificationType, boolean>;

export default function RespiratorySettingsPage() {
  const { authorizedFetch } = useRespiratoryAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [orderNotificationsEnabled, setOrderNotificationsEnabled] = useState(true);
  const [caseChatNotificationsEnabled, setCaseChatNotificationsEnabled] = useState(true);
  const [savedNotificationSettings, setSavedNotificationSettings] =
    useState<NotificationSettingsState | null>(null);
  const [notificationLoading, setNotificationLoading] = useState(true);
  const [notificationLoadError, setNotificationLoadError] = useState('');
  const [notificationSaving, setNotificationSaving] = useState(false);
  const notificationSaveInFlightRef = useRef(false);
  const mountedRef = useRef(false);

  // Saved profile image (already committed to GCS/DB).
  const [profileImageSrc, setProfileImageSrc] = useState<string | null>(null);
  // Locally-selected file, previewed but not yet uploaded.
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(
    null
  );
  const [profileImageSaving, setProfileImageSaving] = useState(false);
  const [profileImageError, setProfileImageError] = useState('');
  const profileImageObjectUrlRef = useRef<string | null>(null);
  const pendingImagePreviewRef = useRef<string | null>(null);

  const applyDoctorProfileToForm = useCallback(
    (doctor: DoctorProfileData | null | undefined) => {
      setBirthDate(doctor?.birth_date || '');
      setGender(doctor?.gender || '');
      setPhone(doctor?.phone || '');
      setEmail(doctor?.email || '');
      setTags(doctor?.tags || []);
    },
    []
  );

  // Profile images are private GCS objects proxied through an authenticated
  // endpoint, so a plain <img src="..."> can't load them directly - fetch the
  // bytes ourselves and hand the browser a local object URL instead.
  const loadProfileImage = useCallback(
    async (hasImage: boolean) => {
      if (profileImageObjectUrlRef.current) {
        URL.revokeObjectURL(profileImageObjectUrlRef.current);
        profileImageObjectUrlRef.current = null;
      }
      if (!hasImage) {
        setProfileImageSrc(null);
        return;
      }
      try {
        const response = await authorizedFetch(
          `${apiBase}/api/auth/staff/profile/image/`
        );
        if (!response.ok) {
          setProfileImageSrc(null);
          return;
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        profileImageObjectUrlRef.current = objectUrl;
        setProfileImageSrc(objectUrl);
      } catch {
        setProfileImageSrc(null);
      }
    },
    [authorizedFetch]
  );

  const clearPendingImage = useCallback(() => {
    if (pendingImagePreviewRef.current) {
      URL.revokeObjectURL(pendingImagePreviewRef.current);
      pendingImagePreviewRef.current = null;
    }
    setPendingImageFile(null);
    setPendingImagePreview(null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (profileImageObjectUrlRef.current) {
        URL.revokeObjectURL(profileImageObjectUrlRef.current);
      }
      if (pendingImagePreviewRef.current) {
        URL.revokeObjectURL(pendingImagePreviewRef.current);
      }
    };
  }, []);

  useEffect(() => {
    void authorizedFetch(`${apiBase}/api/auth/staff/profile/`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.detail || '프로필을 불러오지 못했습니다.');
        setProfile(data);
        applyDoctorProfileToForm(data.doctor_profile);
        void loadProfileImage(Boolean(data.doctor_profile?.profile_image_uri));
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : '프로필을 불러오지 못했습니다.'
        )
      );
  }, [authorizedFetch, loadProfileImage, applyDoctorProfileToForm]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(
      (['EXAMINATION_ORDER', 'CASE_CHAT'] as NotificationType[]).map(
        async (notificationType) => {
          const response = await authorizedFetch(
            `${apiBase}/api/notifications/me/settings/?notification_type=${notificationType}`,
            { signal: controller.signal }
          );
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.detail || '알림 설정을 불러오지 못했습니다.');
          }
          return data as NotificationSetting;
        }
      )
    )
      .then(([orderSetting, chatSetting]) => {
        if (controller.signal.aborted) return;
        const saved = {
          EXAMINATION_ORDER: orderSetting.enabled !== false,
          CASE_CHAT: chatSetting.enabled !== false,
        };
        setOrderNotificationsEnabled(saved.EXAMINATION_ORDER);
        setCaseChatNotificationsEnabled(saved.CASE_CHAT);
        setSavedNotificationSettings(saved);
        setNotificationLoadError('');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setNotificationLoadError(
          error instanceof Error ? error.message : '알림 설정을 불러오지 못했습니다.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setNotificationLoading(false);
      });
    return () => controller.abort();
  }, [authorizedFetch]);

  // Independent from the profile-image endpoint below - this only ever
  // touches birth_date/gender/phone/email/tags, so it never requires an
  // image, and vice versa.
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await authorizedFetch(
        `${apiBase}/api/auth/staff/profile/`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            birth_date: birthDate || null,
            gender: gender || null,
            phone: phone || null,
            email: email || null,
            tags,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.detail || '저장하지 못했습니다.');
        return;
      }
      setProfile(data);
      applyDoctorProfileToForm(data.doctor_profile);
      setMessage('프로필 설정을 저장했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    applyDoctorProfileToForm(profile?.doctor_profile);
    setTagDraft('');
    setMessage('');
  };

  const saveNotificationSettings = async () => {
    if (
      notificationSaveInFlightRef.current ||
      notificationLoading ||
      !savedNotificationSettings
    ) {
      return;
    }
    const currentSettings: NotificationSettingsState = {
      EXAMINATION_ORDER: orderNotificationsEnabled,
      CASE_CHAT: caseChatNotificationsEnabled,
    };
    const settings = (Object.keys(currentSettings) as NotificationType[])
      .filter(
        (notificationType) =>
          currentSettings[notificationType] !==
          savedNotificationSettings[notificationType]
      )
      .map((notificationType) => ({
        notification_type: notificationType,
        enabled: currentSettings[notificationType],
      }));
    if (!settings.length) return;

    notificationSaveInFlightRef.current = true;
    setNotificationSaving(true);
    try {
      const results = await Promise.allSettled(
        settings.map(async (setting) => {
          const response = await authorizedFetch(
            `${apiBase}/api/notifications/me/settings/`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(setting),
            }
          );
          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.detail || '알림 설정을 저장하지 못했습니다.');
          }
          return data as NotificationSetting;
        })
      );
      const successful = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : []
      );
      if (mountedRef.current && successful.length) {
        setSavedNotificationSettings((saved) => {
          if (!saved) return saved;
          const next = { ...saved };
          successful.forEach((setting) => {
            next[setting.notification_type] = setting.enabled;
          });
          return next;
        });
        successful.forEach((setting) => {
          if (setting.notification_type === 'EXAMINATION_ORDER') {
            setOrderNotificationsEnabled(setting.enabled);
          } else {
            setCaseChatNotificationsEnabled(setting.enabled);
          }
        });
      }
      if (results.some((result) => result.status === 'rejected')) {
        showToast.error('알림 설정을 저장하지 못했습니다.', {
          id: 'notification-settings-save',
        });
        return;
      }
      showToast.success('알림 설정이 저장되었습니다.', {
        id: 'notification-settings-save',
      });
    } finally {
      notificationSaveInFlightRef.current = false;
      if (mountedRef.current) setNotificationSaving(false);
    }
  };

  const notificationSettingsDirty = Boolean(
    savedNotificationSettings &&
      (savedNotificationSettings.EXAMINATION_ORDER !== orderNotificationsEnabled ||
        savedNotificationSettings.CASE_CHAT !== caseChatNotificationsEnabled)
  );

  const addTag = () => {
    const trimmed = tagDraft.trim();
    if (!trimmed || tags.includes(trimmed) || tags.length >= 10) {
      setTagDraft('');
      return;
    }
    setTags((current) => [...current, trimmed]);
    setTagDraft('');
  };

  const removeTag = (tag: string) => {
    setTags((current) => current.filter((item) => item !== tag));
  };

  // File selection only stages a local preview - nothing is sent to the
  // server until the user explicitly clicks "변경".
  const handleProfileImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_PROFILE_IMAGE_TYPES.includes(file.type)) {
      setProfileImageError(
        'jpg, png, webp 형식의 이미지만 업로드할 수 있습니다.'
      );
      return;
    }
    setProfileImageError('');
    if (pendingImagePreviewRef.current) {
      URL.revokeObjectURL(pendingImagePreviewRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    pendingImagePreviewRef.current = previewUrl;
    setPendingImageFile(file);
    setPendingImagePreview(previewUrl);
  };

  const handleCancelProfileImage = () => {
    clearPendingImage();
    setProfileImageError('');
  };

  const handleConfirmProfileImage = async () => {
    if (!pendingImageFile) return;
    setProfileImageError('');
    setProfileImageSaving(true);
    try {
      const formData = new FormData();
      formData.append('image', pendingImageFile);
      const response = await authorizedFetch(
        `${apiBase}/api/auth/staff/profile/image/`,
        { method: 'POST', body: formData }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.detail || '이미지를 업로드하지 못했습니다.');
      // Only now - after a confirmed successful upload - does the preview
      // get replaced by the actual saved image; a failure leaves both the
      // preview and the previously saved image untouched.
      setProfile(data);
      await loadProfileImage(Boolean(data.doctor_profile?.profile_image_uri));
      clearPendingImage();
      setMessage('프로필 사진을 변경했습니다.');
    } catch (error) {
      setProfileImageError(
        error instanceof Error
          ? error.message
          : '이미지를 업로드하지 못했습니다.'
      );
    } finally {
      setProfileImageSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-[1760px] px-4 py-4 sm:px-6 sm:py-5">
          <p className="py-12 text-sm text-slate-400">
            프로필을 불러오는 중입니다.
          </p>
        </div>
      </div>
    );
  }

  const departmentRoleLine = `${profile.department?.name || '-'} / ${profile.role || '-'}`;

  return (
    // This page manages its own vertical scroll (the shared respiratory
    // layout's <main> is overflow-hidden by design, so each page provides
    // its own single scroll container - matching the sibling cases page).
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1760px] px-4 py-3 sm:px-6 sm:py-4 xl:py-3">
        <div className="grid grid-cols-1 gap-4 xl:gap-4 lg:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)]">
        {/* 좌측: 내 프로필 */}
        <section className="min-w-0 rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6 xl:p-5">
          <h1 className="text-lg font-bold text-slate-900">내 프로필</h1>

          {/* Hero: 정보 자체를 강조하는 옅은 tint만 사용 (일러스트/그래픽 없음) */}
          <div className="mt-4 min-w-0 rounded-2xl bg-gradient-to-br from-sky-50 via-blue-50/60 to-white p-4 sm:p-5 xl:p-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="relative h-28 w-28 shrink-0 sm:h-32 sm:w-32">
                <div className="h-full w-full overflow-hidden rounded-full border border-white bg-slate-100 shadow-sm">
                  {pendingImagePreview || profileImageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pendingImagePreview || profileImageSrc || undefined}
                      alt="프로필 사진"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <DefaultAvatarIcon />
                  )}
                </div>
                <label className="absolute bottom-0.5 right-0.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow-sm hover:bg-blue-700">
                  <CameraIcon />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleProfileImageSelect}
                    disabled={profileImageSaving}
                    className="hidden"
                  />
                </label>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-bold text-slate-900">
                  {profile.name}
                </p>
                <p className="mt-1 truncate text-sm text-slate-600">
                  {departmentRoleLine}
                </p>
                {tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block rounded-full bg-white/80 px-3 py-1 text-sm font-medium text-sky-700 ring-1 ring-sky-100"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {pendingImageFile && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleConfirmProfileImage()}
                  disabled={profileImageSaving}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-blue-300"
                >
                  {profileImageSaving ? '변경 중...' : '변경'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelProfileImage}
                  disabled={profileImageSaving}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                >
                  취소
                </button>
              </div>
            )}
            {profileImageError && (
              <p className="mt-1.5 text-xs text-rose-600">
                {profileImageError}
              </p>
            )}
          </div>

          <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
            <InfoRow
              icon={<HospitalIcon />}
              label="소속 병원"
              value={profile.hospital?.name || '-'}
            />
            <InfoRow
              icon={<DepartmentIcon />}
              label="부서"
              value={profile.department?.name || '-'}
            />
            <InfoRow
              icon={<RoleIcon />}
              label="역할"
              value={profile.role || '-'}
            />
            <InfoRow
              icon={<GenderIcon />}
              label="성별"
              value={gender ? GENDER_LABELS[gender] || gender : '-'}
            />
            <InfoRow icon={<PhoneIcon />} label="연락처" value={phone || '-'} />
            <InfoRow icon={<MailIcon />} label="이메일" value={email || '-'} />
            <InfoRow
              icon={<CalendarIcon />}
              label="생년월일"
              value={birthDate || '-'}
            />
          </div>
        </section>

        {/* 우측: 기본 정보 설정 */}
        <section className="min-w-0 rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm lg:p-6 xl:p-5">
          <h2 className="text-lg font-bold text-slate-900">기본 정보 설정</h2>

          <form onSubmit={save} className="mt-4 min-w-0">
            {/* 변경 불가능 정보: 현재 read-only 필드 그대로, 시각적으로만 그룹화 */}
            <div className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:p-5 xl:p-4">
              <div className="flex items-center gap-1.5 text-slate-500">
                <LockIcon />
                <h3 className="text-sm font-semibold text-slate-600">
                  계정 및 소속 정보
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">
                관리자 또는 시스템에서 관리되는 정보입니다.
              </p>
              <div className="mt-3 grid min-w-0 grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                <ReadOnlyField label="이름" value={profile.name} />
                <ReadOnlyField label="로그인 ID" value={profile.username} />
                <ReadOnlyField
                  label="소속 병원"
                  value={profile.hospital?.name || '-'}
                />
                <ReadOnlyField
                  label="부서"
                  value={profile.department?.name || '-'}
                />
                <ReadOnlyField label="역할" value={profile.role || '-'} />
              </div>
            </div>

            {/* 변경 가능한 정보: 현재 API에서 수정 가능한 필드 그대로 */}
            <div className="mt-4 min-w-0">
              <h3 className="text-sm font-semibold text-slate-700">
                기본 정보
              </h3>
              <div className="mt-3 grid min-w-0 grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                <TextField
                  label="연락처"
                  value={phone}
                  // Strips anything but digits on every change - covers both
                  // typing and paste, since a paste also fires onChange with
                  // the full resulting value already inserted.
                  onChange={(value) => setPhone(value.replace(/\D/g, ''))}
                  placeholder="01000000000"
                  icon={<PhoneIcon />}
                  inputMode="numeric"
                />
                <TextField
                  label="이메일"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="doctor@hospital.com"
                  icon={<MailIcon />}
                />
                <SelectField
                  label="성별"
                  value={gender}
                  onChange={setGender}
                  options={GENDER_OPTIONS}
                />
                <DateField
                  label="생년월일"
                  value={birthDate}
                  onChange={setBirthDate}
                />
              </div>
            </div>

            <div className="mt-4 min-w-0 border-t border-slate-100 pt-4">
              <span className="block text-sm font-medium text-slate-700">
                분야 태그
              </span>
              {tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        aria-label={`${tag} 태그 삭제`}
                        className="text-sky-400 hover:text-sky-600"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 flex min-w-0 gap-2">
                <input
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="예: 흉부 CT"
                  disabled={tags.length >= 10}
                  className="block h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={addTag}
                  disabled={tags.length >= 10}
                  className="h-11 shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  추가
                </button>
              </div>
              <span className="mt-1 block text-xs text-slate-400">
                하나씩 입력 후 추가하며 최대 10개까지 저장할 수 있습니다.
              </span>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="h-11 rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                className="h-11 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>

          <section className="mt-5 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-700">알림 설정</h3>
            <p className="mt-1 text-xs text-slate-400">
              검사 오더와 나에게 수신된 개인 Case 메시지 알림을 관리합니다.
            </p>
            <div className="mt-3 space-y-2">
              <NotificationToggle
                title="검사 오더 알림"
                description="내 담당 Case에 새 검사 오더가 생성되면 알립니다."
                enabled={orderNotificationsEnabled}
                onChange={setOrderNotificationsEnabled}
                disabled={notificationLoading || notificationSaving}
              />
              <NotificationToggle
                title="개인 Case 메시지 알림"
                description="나를 수신자로 지정한 개인 Case 메시지가 도착하면 알립니다."
                enabled={caseChatNotificationsEnabled}
                onChange={setCaseChatNotificationsEnabled}
                disabled={notificationLoading || notificationSaving}
              />
            </div>
            {notificationLoadError && (
              <p role="alert" className="mt-3 text-xs text-rose-700">
                {notificationLoadError}
              </p>
            )}
            <button
              type="button"
              disabled={
                notificationLoading ||
                notificationSaving ||
                !notificationSettingsDirty
              }
              onClick={() => void saveNotificationSettings()}
              className="mt-3 h-10 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {notificationSaving
                ? '저장 중...'
                : notificationLoading
                  ? '불러오는 중...'
                  : '알림 설정 저장'}
            </button>
          </section>

          {message && (
            <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {message}
            </p>
          )}
        </section>
        </div>
      </div>
    </div>
  );
}

function NotificationToggle({
  title,
  description,
  enabled,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 has-disabled:cursor-not-allowed has-disabled:opacity-60">
      <span>
        <span className="block text-sm font-medium text-slate-700">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-400">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={enabled}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-blue-600"
      />
    </label>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[28px_88px_minmax(0,1fr)] items-center gap-3 px-3.5 py-2 text-sm even:bg-slate-50/60 sm:grid-cols-[28px_100px_minmax(0,1fr)]">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-400 ring-1 ring-slate-100">
        {icon}
      </span>
      <span className="min-w-0 truncate text-slate-500">{label}</span>
      <span className="min-w-0 truncate font-medium text-slate-800">
        {value}
      </span>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1.5 flex h-11 items-center rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm text-slate-600">
        {value}
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  icon,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  icon?: React.ReactNode;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="relative mt-1.5">
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {icon && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-300">
            {icon}
          </span>
        )}
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="relative mt-1.5">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-9 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          <ChevronDownIcon />
        </span>
      </div>
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date());

  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="relative mt-1.5">
        <button
          type="button"
          onClick={() => {
            setPickerMonth(parseBirthDate(value) ?? new Date());
            setPickerOpen((current) => !current);
          }}
          aria-expanded={pickerOpen}
          aria-haspopup="dialog"
          className={`h-11 w-full rounded-xl border border-slate-200 px-3 pr-9 text-left text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 ${
            value ? 'text-slate-800' : 'text-slate-400'
          }`}
        >
          {value || '생년월일을 선택하세요'}
        </button>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          <CalendarIcon />
        </span>
        {pickerOpen && (
          <div
            role="dialog"
            aria-label="생년월일 선택"
            className="absolute left-0 top-full z-20 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
          >
            <DayPicker
              mode="single"
              month={pickerMonth}
              onMonthChange={setPickerMonth}
              selected={parseBirthDate(value)}
              onSelect={(date) => {
                if (!date) return;
                onChange(formatBirthDate(date));
                setPickerOpen(false);
              }}
              locale={ko}
              captionLayout="dropdown"
              startMonth={birthDateStartMonth}
              endMonth={new Date()}
              disabled={{ after: new Date() }}
              formatters={{
                formatMonthDropdown: (date) => `${date.getMonth() + 1}월`,
                formatYearDropdown: (date) => `${date.getFullYear()}년`,
                formatWeekdayName: (date) =>
                  ['일', '월', '화', '수', '목', '금', '토'][date.getDay()],
              }}
              classNames={{
                root: 'text-sm text-slate-700',
                months: 'flex',
                month: 'space-y-3',
                month_caption: 'flex h-8 items-center justify-center',
                dropdowns: 'flex items-center gap-2',
                dropdown_root: 'relative inline-flex',
                dropdown:
                  'absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0',
                caption_label:
                  'inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-sm',
                chevron: 'ml-1',
                nav: 'hidden',
                month_grid: 'border-collapse',
                weekdays: 'border-b border-slate-100',
                weekday: 'h-8 w-9 text-center text-xs font-medium text-slate-400',
                week: '',
                day: 'h-9 w-9 text-center',
                day_button:
                  'h-8 w-8 rounded-md text-sm transition hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:text-slate-300',
                selected:
                  '[&>button]:bg-blue-500 [&>button]:text-white [&>button]:hover:bg-blue-500 [&>button]:hover:text-white',
                today: '[&>button]:font-semibold [&>button]:text-blue-600',
                outside: '[&>button]:text-slate-300',
                disabled:
                  '[&>button]:text-slate-300 [&>button]:hover:bg-transparent [&>button]:hover:text-slate-300',
              }}
            />
          </div>
        )}
      </div>
    </label>
  );
}

// Neutral gray person-silhouette placeholder shown when no profile image is
// set - avoids a broken/empty image without adding an icon library or asset.
function DefaultAvatarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-full w-full text-slate-300"
      aria-label="기본 프로필 아이콘"
    >
      <circle cx="12" cy="12" r="12" fill="currentColor" />
      <circle cx="12" cy="9.5" r="3.5" fill="white" />
      <path
        d="M4.5 19.2C5.8 16.1 8.6 14.5 12 14.5c3.4 0 6.2 1.6 7.5 4.7A11.94 11.94 0 0 1 12 24a11.94 11.94 0 0 1-7.5-4.8Z"
        fill="white"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <rect x="4.5" y="9" width="11" height="7.5" rx="1.6" />
      <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
    </svg>
  );
}

function iconProps() {
  return {
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'h-4 w-4',
  };
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      className="h-3.5 w-3.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 7h2.5L8 5h4l1.5 2H16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"
      />
      <circle
        cx="10"
        cy="11"
        r="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HospitalIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M4 17.5V5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v12" />
      <path d="M2.5 17.5h15" />
      <path d="M10 7.5v4M8 9.5h4" />
      <path d="M6.5 12.5h1.2M12.3 12.5h1.2" />
    </svg>
  );
}

function DepartmentIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M3 7.5 10 4l7 3.5-7 3.5-7-3.5Z" />
      <path d="M3 7.5v6L10 17l7-3.5v-6" />
    </svg>
  );
}

function RoleIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="3.5" width="12" height="13" rx="2" />
      <circle cx="10" cy="8.3" r="1.8" />
      <path d="M6.8 13.5c.5-1.5 1.8-2.2 3.2-2.2s2.7.7 3.2 2.2" />
    </svg>
  );
}

function GenderIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="10" cy="7" r="3" />
      <path d="M5.5 17c.7-2.6 2.5-4 4.5-4s3.8 1.4 4.5 4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M5 3.5h2.2l1 3.2-1.6 1.3a9 9 0 0 0 4.4 4.4l1.3-1.6 3.2 1v2.2a1.5 1.5 0 0 1-1.6 1.5A12.5 12.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="5" width="14" height="10" rx="1.6" />
      <path d="m4 6 6 5 6-5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3.5" y="4.5" width="13" height="12" rx="1.6" />
      <path d="M3.5 8.3h13M7 3v3M13 3v3" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="m5.5 8 4.5 4.5L14.5 8" />
    </svg>
  );
}
