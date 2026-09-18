'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRespiratoryAuth } from '../_components/respiratory-auth-provider';

const ALLOWED_PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Profile = {
  name: string;
  username: string;
  department?: { name?: string };
  hospital?: { name?: string };
  role?: string;
  doctor_profile?: {
    license_number?: string;
    birth_date?: string | null;
    gender?: string | null;
    profile_image_uri?: string | null;
    tags?: string[];
  } | null;
};
const apiBase = (
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
).replace(/\/+$/, '');

export default function RespiratorySettingsPage() {
  const { authorizedFetch } = useRespiratoryAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [tags, setTags] = useState('');
  const [message, setMessage] = useState('');
  const [orderNotificationsEnabled, setOrderNotificationsEnabled] =
    useState(true);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [profileImageSrc, setProfileImageSrc] = useState<string | null>(null);
  const [profileImageUploading, setProfileImageUploading] = useState(false);
  const [profileImageError, setProfileImageError] = useState('');
  const profileImageObjectUrlRef = useRef<string | null>(null);

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

  useEffect(() => {
    return () => {
      if (profileImageObjectUrlRef.current) {
        URL.revokeObjectURL(profileImageObjectUrlRef.current);
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
        const doctor = data.doctor_profile;
        setLicenseNumber(doctor?.license_number || '');
        setBirthDate(doctor?.birth_date || '');
        setGender(doctor?.gender || '');
        setTags((doctor?.tags || []).join(', '));
        void loadProfileImage(Boolean(doctor?.profile_image_uri));
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : '프로필을 불러오지 못했습니다.'
        )
      );
  }, [authorizedFetch, loadProfileImage]);
  useEffect(() => {
    void authorizedFetch(`${apiBase}/api/notifications/me/settings/`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.detail || '알림 설정을 불러오지 못했습니다.');
        setOrderNotificationsEnabled(data.enabled !== false);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : '알림 설정을 불러오지 못했습니다.'
        )
      );
  }, [authorizedFetch]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const response = await authorizedFetch(
      `${apiBase}/api/auth/staff/profile/`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_number: licenseNumber,
          birth_date: birthDate || null,
          gender: gender || null,
          tags: tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.detail || '저장하지 못했습니다.');
      return;
    }
    setProfile(data);
    setMessage('프로필 설정을 저장했습니다.');
  };
  const handleProfileImageSelect = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_PROFILE_IMAGE_TYPES.includes(file.type)) {
      setProfileImageError('jpg, png, webp 형식의 이미지만 업로드할 수 있습니다.');
      return;
    }
    setProfileImageError('');
    setProfileImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await authorizedFetch(
        `${apiBase}/api/auth/staff/profile/image/`,
        { method: 'POST', body: formData }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.detail || '이미지를 업로드하지 못했습니다.');
      setProfile(data);
      await loadProfileImage(Boolean(data.doctor_profile?.profile_image_uri));
      setMessage('프로필 사진을 변경했습니다.');
    } catch (error) {
      setProfileImageError(
        error instanceof Error
          ? error.message
          : '이미지를 업로드하지 못했습니다.'
      );
    } finally {
      setProfileImageUploading(false);
    }
  };
  const saveOrderNotificationSetting = async () => {
    setNotificationSaving(true);
    try {
      const response = await authorizedFetch(
        `${apiBase}/api/notifications/me/settings/`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notification_type: 'EXAMINATION_ORDER',
            enabled: orderNotificationsEnabled,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.detail || '알림 설정을 저장하지 못했습니다.');
      setOrderNotificationsEnabled(data.enabled);
      setMessage('검사 오더 알림 설정을 저장했습니다.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : '알림 설정을 저장하지 못했습니다.'
      );
    } finally {
      setNotificationSaving(false);
    }
  };
  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold text-blue-600">의사 설정</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">내 프로필</h1>
        <p className="mt-2 text-sm text-slate-500">
          진료과와 병원 소속 정보는 관리자 관리 항목입니다.
        </p>
        {!profile ? (
          <p className="py-12 text-sm text-slate-400">
            프로필을 불러오는 중입니다.
          </p>
        ) : (
          <>
            <div className="mt-6 flex items-center gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                {profileImageSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileImageSrc}
                    alt="프로필 사진"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
                    사진 없음
                  </div>
                )}
              </div>
              <div>
                <label className="inline-block cursor-pointer rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {profileImageUploading ? '업로드 중...' : '프로필 사진 변경'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void handleProfileImageSelect(event)}
                    disabled={profileImageUploading}
                    className="hidden"
                  />
                </label>
                {profileImageError && (
                  <p className="mt-1.5 text-xs text-rose-600">
                    {profileImageError}
                  </p>
                )}
              </div>
            </div>
            <form onSubmit={save} className="mt-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <ReadField label="이름" value={profile.name} />
                <ReadField label="로그인 ID" value={profile.username} />
                <ReadField label="병원" value={profile.hospital?.name || '-'} />
                <ReadField
                  label="진료과 / 역할"
                  value={`${profile.department?.name || '-'} / ${profile.role || '-'}`}
                />
                <label className="text-sm font-medium text-slate-700">
                  의사 면허번호
                  <input
                    required
                    value={licenseNumber}
                    onChange={(event) => setLicenseNumber(event.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  생년월일
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  성별
                  <select
                    value={gender}
                    onChange={(event) => setGender(event.target.value)}
                    className="mt-1.5 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">미기재</option>
                    <option value="MALE">남성</option>
                    <option value="FEMALE">여성</option>
                    <option value="OTHER">기타</option>
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium text-slate-700">
                전문 분야 태그
                <input
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder="폐암, 흉부 CT, 기관지내시경"
                  className="mt-1.5 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-slate-400">
                  쉼표로 구분하며 최대 10개까지 저장할 수 있습니다.
                </span>
              </label>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                저장
              </button>
            </form>
            <section className="mt-6 border-t border-slate-200 pt-5">
              <h2 className="text-base font-bold text-slate-900">알림 설정</h2>
              <div className="mt-3 flex items-center justify-between gap-4 rounded-lg bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    검사 오더 알림
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    담당 부서로 전달된 새 검사 오더를 알립니다.
                  </p>
                </div>
                <label className="flex shrink-0 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={orderNotificationsEnabled}
                    onChange={(event) =>
                      setOrderNotificationsEnabled(event.target.checked)
                    }
                  />{' '}
                  수신
                </label>
              </div>
              <button
                type="button"
                disabled={notificationSaving}
                onClick={() => void saveOrderNotificationSetting()}
                className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 disabled:bg-slate-100"
              >
                {notificationSaving ? '저장 중...' : '알림 설정 저장'}
              </button>
            </section>
            {message && (
              <p className="mt-5 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
                {message}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <label className="text-sm font-medium text-slate-700">
      {label}
      <input
        value={value}
        readOnly
        className="mt-1.5 block w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500"
      />
    </label>
  );
}
