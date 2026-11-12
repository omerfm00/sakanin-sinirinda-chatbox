import { StrictMode, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type User = {
  id: string;
  username: string;
  role: 'student' | 'teacher' | 'admin';
  tutorialCompleted: boolean;
};

type ManagedUser = {
  id: string;
  username: string;
  role: User['role'];
  createdAt: string;
};

type ExpertQuestion = {
  id: string;
  question: string;
  answer: string | null;
  scenarioTitle: string | null;
  studentUsername: string;
  answeredByUsername: string | null;
  createdAt: string;
  answeredAt: string | null;
};

type AuditLog = {
  id: string;
  actorUsername: string | null;
  actorRole: User['role'] | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

type Perspective = {
  id: string;
  label: string;
  text: string;
};

type ReflectionQuestion = {
  id: string;
  text: string;
};

type ScenarioContent = {
  title: string;
  scenarioText: string;
  context: string;
  videoUrl: string;
  perspectives: Perspective[];
  reflectionQuestions: ReflectionQuestion[];
};

type ScenarioSummary = {
  id: string;
  title: string;
  status: 'draft' | 'published';
  createdAt: string;
  publishedAt: string | null;
};

type Scenario = ScenarioContent & ScenarioSummary & {
  updatedAt: string;
  uploadedVideoUrl: string;
};

type StudentResponse = {
  studentId: string;
  studentUsername: string;
  scenarioId: string;
  scenarioTitle: string;
  answers: Record<string, string>;
  reflectionQuestions: ReflectionQuestion[];
  classification: 'joke' | 'bullying' | null;
  reasoning: string | null;
  updatedAt: string;
};

type ApiFailure = {
  message?: string | string[];
};

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:3000/api`
    : '/api');
const STUDENT_APP_URL =
  import.meta.env.VITE_STUDENT_APP_URL ||
  (import.meta.env.DEV ? 'http://localhost:5173' : 'http://localhost:8081');

async function request<T>(
  path: string,
  body?: object,
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: method ?? (body ? 'POST' : 'GET'),
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiFailure;
  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(' ')
      : payload.message;
    throw new ApiRequestError(
      message || `İstek başarısız oldu (${response.status}).`,
      response.status,
    );
  }
  return payload;
}

function emptyContent(): ScenarioContent {
  return {
    title: '',
    scenarioText: '',
    context: '',
    videoUrl: '',
    perspectives: [
      { id: crypto.randomUUID(), label: '', text: '' },
      { id: crypto.randomUUID(), label: '', text: '' },
    ],
    reflectionQuestions: [{ id: crypto.randomUUID(), text: '' }],
  };
}

function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'accounts' | 'content' | 'logs' | 'questions' | 'responses'>('content');
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [expertQuestions, setExpertQuestions] = useState<ExpertQuestion[]>([]);
  const [studentResponses, setStudentResponses] = useState<StudentResponse[]>([]);
  const [auditUserId, setAuditUserId] = useState('');
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditOffset, setAuditOffset] = useState(0);
  const [responseUserId, setResponseUserId] = useState('');
  const [responseScenarioId, setResponseScenarioId] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<{
    username: string;
    password: string;
    role: User['role'];
  }>({ username: '', password: '', role: 'student' });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<'draft' | 'published' | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState('');
  const [pendingVideo, setPendingVideo] = useState<File | null>(null);
  const [form, setForm] = useState<ScenarioContent>(() => emptyContent());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 760px)');
    const updateDevice = () => {
      document.documentElement.dataset.deviceType = viewport.matches ? 'mobile' : 'desktop';
    };
    updateDevice();
    viewport.addEventListener('change', updateDevice);
    return () => viewport.removeEventListener('change', updateDevice);
  }, []);

  useEffect(() => {
    void request<User>('/auth/me?role=admin')
      .then((currentUser) => {
        if (currentUser.role === 'admin') {
          setUser(currentUser);
          if (!currentUser.tutorialCompleted) {
            setTutorialStep(0);
            setSidebarOpen(window.matchMedia('(max-width: 760px)').matches);
          }
        }
        else setRedirecting(true);
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiRequestError && (cause.status === 401 || cause.status === 403)) {
          setRedirecting(true);
        } else setError(errorMessage(cause));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (redirecting) window.location.replace(`${STUDENT_APP_URL}/login`);
  }, [redirecting]);

  useEffect(() => {
    if (user) {
      void refreshScenarios();
      void refreshUsers();
      void refreshAuditLogs();
      void refreshExpertQuestions();
      void refreshStudentResponses();
    }
  }, [user]);

  useEffect(() => {
    if (user && activeTab === 'responses') void refreshStudentResponses();
  }, [user, activeTab, responseUserId, responseScenarioId]);

  useEffect(() => {
    if (user && activeTab === 'logs') void refreshAuditLogs();
  }, [user, activeTab, auditUserId]);

  async function refreshScenarios() {
    try {
      setScenarios(await request<ScenarioSummary[]>('/scenarios/manage'));
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function refreshUsers() {
    try {
      setManagedUsers(await request<ManagedUser[]>('/admin/users'));
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function refreshAuditLogs(offset = 0, append = false) {
    try {
      const filters = new URLSearchParams({ limit: '200', offset: String(offset) });
      if (auditUserId) filters.set('userId', auditUserId);
      const result = await request<{ logs: AuditLog[]; hasMore: boolean }>(
        `/admin/audit-logs?${filters.toString()}`,
      );
      setAuditLogs((current) => append ? [...current, ...result.logs] : result.logs);
      setAuditOffset(offset + result.logs.length);
      setAuditHasMore(result.hasMore);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function refreshExpertQuestions() {
    try {
      setExpertQuestions(await request<ExpertQuestion[]>('/expert-questions'));
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function refreshStudentResponses() {
    try {
      const filters = new URLSearchParams();
      if (responseUserId) filters.set('studentId', responseUserId);
      if (responseScenarioId) filters.set('scenarioId', responseScenarioId);
      const query = filters.size ? `?${filters.toString()}` : '';
      setStudentResponses(await request<StudentResponse[]>(`/scenarios/admin/responses${query}`));
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function finishTutorial() {
    try {
      const updated = await request<User>('/auth/tutorial-complete', {}, 'PATCH');
      setUser(updated);
      setTutorialStep(null);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountSaving(true);
    setError('');
    setMessage('');
    const body = editingUserId
      ? {
          username: accountForm.username,
          ...(accountForm.password ? { password: accountForm.password } : {}),
        }
      : accountForm;
    try {
      await request<ManagedUser>(
        editingUserId ? `/admin/users/${editingUserId}` : '/admin/users',
        body,
        editingUserId ? 'PATCH' : 'POST',
      );
      setMessage(editingUserId ? 'Hesap bilgileri güncellendi.' : 'Hesap oluşturuldu.');
      setAccountForm({ username: '', password: '', role: 'student' });
      setEditingUserId(null);
      await refreshUsers();
      await refreshAuditLogs();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setAccountSaving(false);
    }
  }

  function editAccount(account: ManagedUser) {
    setEditingUserId(account.id);
    setAccountForm({ username: account.username, password: '', role: account.role });
    setError('');
    setMessage('');
  }

  async function loadScenario(id: string) {
    setError('');
    setMessage('');
    try {
      const scenario = await request<Scenario>(`/scenarios/manage/${id}`);
      setCurrentId(scenario.id);
      setCurrentStatus(scenario.status);
      setUploadedVideoUrl(scenario.uploadedVideoUrl);
      setPendingVideo(null);
      setForm({
        title: scenario.title,
        scenarioText: scenario.scenarioText,
        context: scenario.context,
        videoUrl: scenario.videoUrl,
        perspectives: scenario.perspectives,
        reflectionQuestions: scenario.reflectionQuestions,
      });
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  function startNewScenario() {
    setCurrentId(null);
    setCurrentStatus('draft');
    setUploadedVideoUrl('');
    setPendingVideo(null);
    setForm(emptyContent());
    setError('');
    setMessage('');
  }

  async function saveScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const scenario = currentId
        ? await request<Scenario>(
            `/scenarios/manage/${currentId}`,
            form,
            'PUT',
          )
        : await request<Scenario>('/scenarios/manage', form);
      setCurrentId(scenario.id);
      setCurrentStatus(scenario.status);
      setUploadedVideoUrl(scenario.uploadedVideoUrl);
      setForm({
        title: scenario.title,
        scenarioText: scenario.scenarioText,
        context: scenario.context,
        videoUrl: scenario.videoUrl,
        perspectives: scenario.perspectives,
        reflectionQuestions: scenario.reflectionQuestions,
      });
      if (pendingVideo) {
        await uploadScenarioVideo(pendingVideo, scenario.id);
        setPendingVideo(null);
      }
      setMessage('Taslak kaydedildi. Öğrencilere görünmesi için ayrıca yayınlayın.');
      await refreshScenarios();
      await refreshAuditLogs();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  async function changePublication(action: 'publish' | 'unpublish') {
    if (!currentId) return;
    setError('');
    setMessage('');
    try {
      const scenario = await request<Scenario>(
        `/scenarios/manage/${currentId}/${action}`,
        {},
      );
      setCurrentStatus(scenario.status);
      setMessage(
        scenario.status === 'published'
          ? 'Senaryo öğrencilere açıldı.'
          : 'Senaryo taslağa alındı. Artık düzenlenebilir.',
      );
      await refreshScenarios();
      await refreshAuditLogs();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function deleteScenario() {
    if (!currentId) return;
    const confirmed = window.confirm(
      'Bu senaryoyu tamamen silmek istediğine emin misin? Yayımlanmış olsa bile bağlı öğrenci yanıtları ve yüklenen video kalıcı olarak silinir.',
    );
    if (!confirmed) return;
    setError('');
    setMessage('');
    try {
      await request<{ message: string }>(`/scenarios/manage/${currentId}`, undefined, 'DELETE');
      setCurrentId(null);
      setCurrentStatus(null);
      setUploadedVideoUrl('');
      setPendingVideo(null);
      setForm(emptyContent());
      setMessage('Senaryo ve bağlı yanıtlar silindi.');
      await refreshScenarios();
      await refreshAuditLogs();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function deleteAccount(account: ManagedUser) {
    if (account.id === user?.id) {
      setError('Kullanmakta olduğun yönetici hesabını silemezsin.');
      return;
    }
    if (!window.confirm(
      `${account.username} hesabı config/users.json dosyasından kaldırılacak. Hesaba bağlı öğrenci yanıtları ve sorular da kalıcı olarak silinecek. Devam edilsin mi?`,
    )) return;
    setError('');
    setMessage('');
    try {
      await request(`/admin/users/${account.id}`, undefined, 'DELETE');
      setMessage(`${account.username} hesabı silindi.`);
      await refreshUsers();
      await refreshStudentResponses();
      await refreshAuditLogs();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  async function uploadScenarioVideo(file: File, scenarioId: string | null = currentId) {
    if (!scenarioId) {
      setPendingVideo(file);
      setError('');
      setMessage(`“${file.name}” taslak kaydedildikten sonra yüklenecek.`);
      return;
    }
    const formData = new FormData();
    formData.append('video', file);
    setError('');
    setMessage('');
    setVideoUploading(true);
    try {
      const response = await fetch(`${API_BASE}/scenarios/manage/${scenarioId}/video`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as Scenario & ApiFailure;
      if (!response.ok) {
        const error = Array.isArray(payload.message) ? payload.message.join(' ') : payload.message;
        throw new ApiRequestError(error || `İstek başarısız oldu (${response.status}).`, response.status);
      }
      setForm((current) => ({ ...current, videoUrl: payload.videoUrl }));
      setUploadedVideoUrl(payload.uploadedVideoUrl);
      setMessage('Senaryo videosu yüklendi.');
      await refreshScenarios();
      await refreshAuditLogs();
    } catch (cause: unknown) {
      setError(errorMessage(cause));
      throw cause;
    } finally {
      setVideoUploading(false);
    }
  }

  async function logout() {
    setError('');
    try {
      await request('/auth/logout?role=admin', {});
      window.location.assign(STUDENT_APP_URL);
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    }
  }

  if (loading) {
    return (
      <main>
        <p className="eyebrow">Şakanın Sınırında</p>
        <p role="status">Oturum kontrol ediliyor…</p>
      </main>
    );
  }

  if (redirecting) {
    return (
      <main>
        <p className="eyebrow">Şakanın Sınırında</p>
        <p role="status">Tek giriş ekranına yönlendiriliyorsun…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="login-card">
        <p className="eyebrow">Şakanın Sınırında</p>
        <p>Oturum bilgisi alınamadı.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button
          className="primary-button"
          onClick={() => window.location.assign(`${STUDENT_APP_URL}/login`)}
          type="button"
        >
          Giriş sayfasına dön
        </button>
      </main>
    );
  }

  const isPublished = currentStatus === 'published';
  const tutorialSteps = [
    { title: 'Hoş geldin', text: 'Bu menüden hesapları, senaryoları, uzman sorularını, öğrenci yanıtlarını ve işlem kayıtlarını yönetebilirsin.' },
    { title: 'Hesaplar', text: 'Hesapları elle oluşturup düzenleyebilir veya silebilirsin. Parolalar yalnızca config/users.json içinde hash’li tutulur.' },
    { title: 'Senaryolar', text: 'Taslak hazırla, video URL’si ekle veya sunucuya video yükle; yayımla ya da yayımlanmış senaryoyu tamamen sil.' },
    { title: 'Öğrenci değerlendirmeleri', text: 'Şaka/zorbalık seçimini, gerekçeyi ve her soruya verilen yanıtı kullanıcı ya da senaryoya göre inceleyebilirsin.' },
    { title: 'Uzman soruları', text: 'Öğrencilerin uzmana ilettiği soruları bu bölümden inceleyebilirsin.' },
    { title: 'Hareket kayıtları', text: 'Kullanıcıların işlem geçmişine bu bölümden ulaşırsın.' },
    { title: 'Çıkış', text: 'Oturum kapatma düğmesi menünün alt kısmında.' },
  ];

  return (
    <main className={`admin-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Menüyü kapat" onClick={() => setSidebarOpen(false)} type="button" />}
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">ŞS</span>
          <span>Şakanın<br />Sınırında</span>
        </div>
        <p className="sidebar-section-label">MENÜ</p>
        <nav className="admin-tabs" aria-label="Yönetim menüsü">
          <button
            aria-current={activeTab === 'content' ? 'page' : undefined}
            className={activeTab === 'content' ? 'admin-tab active' : 'admin-tab'}
            id="nav-content"
            onClick={() => { setActiveTab('content'); setError(''); setMessage(''); setSidebarOpen(false); }}
            type="button"
          >
            <span aria-hidden="true">▤</span> Öğrenci içerikleri
          </button>
          <button
            aria-current={activeTab === 'accounts' ? 'page' : undefined}
            className={activeTab === 'accounts' ? 'admin-tab active' : 'admin-tab'}
            id="nav-accounts"
            onClick={() => { setActiveTab('accounts'); setError(''); setMessage(''); setSidebarOpen(false); }}
            type="button"
          >
            <span aria-hidden="true">♙</span> Hesaplar
          </button>
          <button
            aria-current={activeTab === 'questions' ? 'page' : undefined}
            className={activeTab === 'questions' ? 'admin-tab active' : 'admin-tab'}
            id="nav-questions"
            onClick={() => {
              setActiveTab('questions');
              setError('');
              setMessage('');
              setSidebarOpen(false);
              void refreshExpertQuestions();
            }}
            type="button"
          >
            <span aria-hidden="true">✉</span> Uzman soruları
          </button>
          <button
            aria-current={activeTab === 'logs' ? 'page' : undefined}
            className={activeTab === 'logs' ? 'admin-tab active' : 'admin-tab'}
            id="nav-logs"
            onClick={() => {
              setActiveTab('logs');
              setError('');
              setMessage('');
              setSidebarOpen(false);
              void refreshAuditLogs();
            }}
            type="button"
          >
            <span aria-hidden="true">◷</span> Hareket kayıtları
          </button>
          <button
            aria-current={activeTab === 'responses' ? 'page' : undefined}
            className={activeTab === 'responses' ? 'admin-tab active' : 'admin-tab'}
            id="nav-responses"
            onClick={() => { setActiveTab('responses'); setError(''); setMessage(''); setSidebarOpen(false); }}
            type="button"
          >
            <span aria-hidden="true">▦</span> Öğrenci değerlendirmeleri
          </button>
        </nav>
        <div className="sidebar-user">
          <span className="sidebar-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
          <span className="sidebar-username">{user.username}</span>
          <button className="sidebar-logout" id="sidebar-logout" onClick={() => void logout()} type="button">Çıkış</button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="topbar">
          <div>
            <button
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? 'Menüyü kapat' : 'Menüyü aç'}
              className="mobile-menu-button"
              onClick={() => setSidebarOpen((open) => !open)}
              type="button"
            >
              ☰
            </button>
            <h1>Merhaba, {user.username}</h1>
          </div>
        </header>

      {activeTab !== 'content' && (
        <>
          {message && <p className="success" role="status">{message}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </>
      )}

      {activeTab === 'accounts' && (
        <section className="management-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Kullanıcı yönetimi</p>
              <h2>{editingUserId ? 'Hesabı düzenle' : 'Yeni hesap oluştur'}</h2>
            </div>
          </div>
          <form className="account-form" onSubmit={(event) => void saveAccount(event)}>
            <label htmlFor="account-username">Kullanıcı adı</label>
            <input
              autoComplete="off"
              id="account-username"
              maxLength={32}
              minLength={3}
              onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })}
              pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}"
              required
              value={accountForm.username}
            />
            <label htmlFor="account-role">Hesap türü</label>
            <select
              disabled={Boolean(editingUserId)}
              id="account-role"
              onChange={(event) => setAccountForm({
                ...accountForm,
                    role:
                      event.target.value === 'teacher' || event.target.value === 'admin'
                        ? event.target.value
                        : 'student',
                  })}
              value={accountForm.role}
            >
              <option value="student">Öğrenci</option>
              <option value="teacher">Uzman</option>
              <option value="admin">Admin</option>
            </select>
            <label htmlFor="account-password">
              {editingUserId ? 'Yeni parola (değiştirmeyeceksen boş bırak)' : 'Parola'}
            </label>
            <input
              autoComplete="new-password"
              id="account-password"
              minLength={accountForm.password || !editingUserId ? 12 : undefined}
              onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })}
              required={!editingUserId}
              type="password"
              value={accountForm.password}
            />
            <p className="hint">Parola 12-128 karakter olmalı. Parolalar ve hash'leri loglara yazılmaz.</p>
            <div className="form-actions">
              <button className="primary-button" disabled={accountSaving} type="submit">
                {accountSaving ? 'Kaydediliyor…' : editingUserId ? 'Değişiklikleri kaydet' : 'Hesap oluştur'}
              </button>
              {editingUserId && (
                <button
                  className="secondary-button"
                  onClick={() => {
                    setEditingUserId(null);
                    setAccountForm({ username: '', password: '', role: 'student' });
                  }}
                  type="button"
                >
                  Vazgeç
                </button>
              )}
            </div>
          </form>

          <div className="table-wrap account-table-wrap">
            <table className="account-table">
              <thead>
                <tr><th>Kullanıcı adı</th><th>Tür</th><th>Oluşturulma</th><th /></tr>
              </thead>
              <tbody>
                {managedUsers.map((account) => (
                  <tr key={account.id}>
                    <td data-label="Kullanıcı adı">{account.username}</td>
                    <td data-label="Tür">{roleLabel(account.role)}</td>
                    <td data-label="Oluşturulma">{formatDate(account.createdAt)}</td>
                    <td data-label="İşlemler">
                      <div className="table-actions">
                        <button className="text-button" onClick={() => editAccount(account)} type="button">
                          Düzenle
                        </button>
                        <button className="text-button danger-text" onClick={() => void deleteAccount(account)} type="button">
                          Sil
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {managedUsers.length === 0 && (
                  <tr><td className="muted" colSpan={4}>Henüz hesap yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'content' && <div className="admin-layout">
        <aside className="scenario-sidebar">
          <button className="primary-button" id="new-scenario" onClick={startNewScenario} type="button">
            Yeni senaryo
          </button>
          <h2>Senaryolar</h2>
          {scenarios.length === 0 ? (
            <p className="muted">Henüz senaryo eklenmedi.</p>
          ) : (
            <ul className="scenario-list">
              {scenarios.map((scenario) => (
                <li key={scenario.id}>
                  <button
                    className={`scenario-choice${currentId === scenario.id ? ' selected' : ''}`}
                    onClick={() => void loadScenario(scenario.id)}
                    type="button"
                  >
                    <span>{scenario.title}</span>
                    <small>{scenario.status === 'draft' ? 'Taslak' : 'Yayında'}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="editor">
          <div className="editor-heading">
            <div>
              <p className="eyebrow">
                {currentId ? (isPublished ? 'Yayımlanmış içerik' : 'Taslak') : 'Yeni içerik'}
              </p>
              <h2>{currentId ? (form.title || 'Senaryoyu düzenle') : 'Senaryo oluştur'}</h2>
            </div>
            {currentId && (
              <div className="publication-actions">
                {isPublished ? (
                  <button
                    className="secondary-button"
                    onClick={() => void changePublication('unpublish')}
                    type="button"
                  >
                    Yayından al
                  </button>
                ) : (
                  <>
                    <button
                      className="secondary-button"
                      onClick={() => void changePublication('publish')}
                      type="button"
                    >
                      Yayınla
                    </button>
                  </>
                )}
                <button className="danger-button" onClick={() => void deleteScenario()} type="button">
                  Senaryoyu sil
                </button>
              </div>
            )}
          </div>

          <form onSubmit={(event) => void saveScenario(event)}>
            <label htmlFor="title">Başlık</label>
            <input
              disabled={isPublished}
              id="title"
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              required
              value={form.title}
            />

            <label htmlFor="scenario-text">Senaryo metni</label>
            <textarea
              disabled={isPublished}
              id="scenario-text"
              onChange={(event) => setForm({ ...form, scenarioText: event.target.value })}
              required
              rows={5}
              value={form.scenarioText}
            />

            <label htmlFor="context">Bağlam</label>
            <textarea
              disabled={isPublished}
              id="context"
              onChange={(event) => setForm({ ...form, context: event.target.value })}
              required
              rows={4}
              value={form.context}
            />

            <label htmlFor="video-url">Video bağlantısı (isteğe bağlı)</label>
            <input
              disabled={isPublished}
              id="video-url"
              onChange={(event) => setForm({ ...form, videoUrl: event.target.value })}
              placeholder="https://..."
              type="url"
              value={form.videoUrl}
            />
            {!isPublished && (
              <>
                <label htmlFor="scenario-video">Video dosyası yükle (MP4, WebM veya Ogg · en fazla 100 MB)</label>
                <input
                  accept=".mp4,.webm,.ogv,video/mp4,video/webm,video/ogg"
                  disabled={saving || videoUploading}
                  id="scenario-video"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void uploadScenarioVideo(file).catch(() => undefined);
                    }
                    event.currentTarget.value = '';
                  }}
                  type="file"
                />
                {pendingVideo && (
                  <p className="notice" role="status">
                    Seçilen dosya: {pendingVideo.name}. Taslağı kaydedince yüklenecek.
                  </p>
                )}
              </>
            )}
            {(uploadedVideoUrl || form.videoUrl) && (
              <ScenarioMedia
                className="scenario-video-preview"
                title={form.title || 'Senaryo'}
                url={uploadedVideoUrl || form.videoUrl}
              />
            )}

            <fieldset disabled={isPublished}>
              <legend>Farklı bakış açıları</legend>
              {form.perspectives.map((perspective, index) => (
                <div className="repeater-item" key={perspective.id}>
                  <label htmlFor={`perspective-label-${perspective.id}`}>
                    Bakış açısı {index + 1} — başlık
                  </label>
                  <input
                    id={`perspective-label-${perspective.id}`}
                    onChange={(event) => setForm({
                      ...form,
                      perspectives: form.perspectives.map((item) =>
                        item.id === perspective.id ? { ...item, label: event.target.value } : item,
                      ),
                    })}
                    required
                    value={perspective.label}
                  />
                  <label htmlFor={`perspective-text-${perspective.id}`}>Açıklama</label>
                  <textarea
                    id={`perspective-text-${perspective.id}`}
                    onChange={(event) => setForm({
                      ...form,
                      perspectives: form.perspectives.map((item) =>
                        item.id === perspective.id ? { ...item, text: event.target.value } : item,
                      ),
                    })}
                    required
                    rows={3}
                    value={perspective.text}
                  />
                  {form.perspectives.length > 2 && (
                    <button
                      className="text-button remove-button"
                      onClick={() => setForm({
                        ...form,
                        perspectives: form.perspectives.filter((item) => item.id !== perspective.id),
                      })}
                      type="button"
                    >
                      Kaldır
                    </button>
                  )}
                </div>
              ))}
              <button
                className="text-button"
                onClick={() => setForm({
                  ...form,
                  perspectives: [
                    ...form.perspectives,
                    { id: crypto.randomUUID(), label: '', text: '' },
                  ],
                })}
                type="button"
              >
                + Bakış açısı ekle
              </button>
            </fieldset>

            <fieldset disabled={isPublished}>
              <legend>Yansıtıcı sorular</legend>
              {form.reflectionQuestions.map((question, index) => (
                <div className="repeater-item" key={question.id}>
                  <label htmlFor={`question-${question.id}`}>Soru {index + 1}</label>
                  <textarea
                    id={`question-${question.id}`}
                    onChange={(event) => setForm({
                      ...form,
                      reflectionQuestions: form.reflectionQuestions.map((item) =>
                        item.id === question.id ? { ...item, text: event.target.value } : item,
                      ),
                    })}
                    required
                    rows={2}
                    value={question.text}
                  />
                  {form.reflectionQuestions.length > 1 && (
                    <button
                      className="text-button remove-button"
                      onClick={() => setForm({
                        ...form,
                        reflectionQuestions: form.reflectionQuestions.filter(
                          (item) => item.id !== question.id,
                        ),
                      })}
                      type="button"
                    >
                      Kaldır
                    </button>
                  )}
                </div>
              ))}
              <button
                className="text-button"
                onClick={() => setForm({
                  ...form,
                  reflectionQuestions: [
                    ...form.reflectionQuestions,
                    { id: crypto.randomUUID(), text: '' },
                  ],
                })}
                type="button"
              >
                + Yansıtıcı soru ekle
              </button>
            </fieldset>

            {!isPublished && (
              <button className="primary-button save-button" disabled={saving} type="submit">
                {saving ? 'Kaydediliyor…' : 'Taslak kaydet'}
              </button>
            )}
          </form>
          {isPublished && (
            <p className="notice" role="status">
              Düzenlemek için önce senaryoyu yayından alın. Yayınlama akışı öğrenci yanıtlarını silmez.
            </p>
          )}
          {message && <p className="success" role="status">{message}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </div>
      }

      {activeTab === 'responses' && (
        <section className="management-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ÖĞRENCİ YANITLARI</p>
              <h2>Senaryo değerlendirmeleri</h2>
              <p className="muted">Yanıtlar yalnızca yetkili yönetici ekranında görüntülenir.</p>
            </div>
            <button className="secondary-button" onClick={() => void refreshStudentResponses()} type="button">
              Yenile
            </button>
          </div>
          <div className="response-filters">
            <label>
              Kullanıcı
              <select onChange={(event) => setResponseUserId(event.target.value)} value={responseUserId}>
                <option value="">Tüm kullanıcılar</option>
                {managedUsers.filter((account) => account.role === 'student').map((account) => (
                  <option key={account.id} value={account.id}>{account.username}</option>
                ))}
              </select>
            </label>
            <label>
              Senaryo
              <select onChange={(event) => setResponseScenarioId(event.target.value)} value={responseScenarioId}>
                <option value="">Tüm senaryolar</option>
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>{scenario.title}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="response-list">
            {studentResponses.map((response) => (
              <article className="response-card" key={`${response.studentId}-${response.scenarioId}`}>
                <header className="response-card-heading">
                  <div>
                    <strong>{response.studentUsername}</strong>
                    <span>{response.scenarioTitle}</span>
                  </div>
                  <time dateTime={response.updatedAt}>{formatDate(response.updatedAt)}</time>
                </header>
                <p className={`classification-badge ${response.classification ?? 'unclassified'}`}>
                  {response.classification === 'joke'
                    ? 'Şaka olarak değerlendirdi'
                    : response.classification === 'bullying'
                      ? 'Zorbalık olarak değerlendirdi'
                      : 'Değerlendirme seçilmemiş'}
                </p>
                {response.reasoning && <p className="response-reasoning">{response.reasoning}</p>}
                <div className="response-answers">
                  {response.reflectionQuestions.map((question) => (
                    <section key={question.id}>
                      <h3>{question.text}</h3>
                      <p>{response.answers[question.id] || 'Yanıt verilmedi.'}</p>
                    </section>
                  ))}
                </div>
              </article>
            ))}
            {studentResponses.length === 0 && (
              <p className="muted">Seçilen filtrelerle eşleşen öğrenci değerlendirmesi yok.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === 'logs' && (
        <section className="management-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Son 200 kayıt</p>
              <h2>Hareket kayıtları</h2>
              <p className="muted">Öğrenci yanıt metinleri, parolalar ve parola hash'leri kaydedilmez.</p>
            </div>
            <button className="secondary-button" onClick={() => void refreshAuditLogs()} type="button">
              Yenile
            </button>
          </div>
          <label className="audit-user-filter">
            Kullanıcıya göre filtrele
            <select onChange={(event) => setAuditUserId(event.target.value)} value={auditUserId}>
              <option value="">Tüm kullanıcılar</option>
              {managedUsers.map((account) => (
                <option key={account.id} value={account.id}>{account.username}</option>
              ))}
            </select>
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Tarih</th><th>Kullanıcı</th><th>Hareket</th><th>İçerik</th><th>Detay</th></tr>
              </thead>
              <tbody>
                {auditLogs.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.createdAt)}</td>
                    <td>
                      {entry.actorUsername
                        ? `${entry.actorUsername} · ${entry.actorRole ? roleLabel(entry.actorRole) : ''}`
                        : 'Bilinmeyen kullanıcı'}
                    </td>
                    <td>{auditActionLabel(entry.action)}</td>
                    <td>{entry.entityType === 'scenario' ? 'Senaryo' : entry.entityType === 'user' ? 'Hesap' : 'Oturum'}</td>
                    <td>{auditDetails(entry)}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr><td className="muted" colSpan={5}>Henüz hareket kaydı yok.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {auditHasMore && (
            <button className="secondary-button" onClick={() => void refreshAuditLogs(auditOffset, true)} type="button">
              Daha fazla kayıt yükle
            </button>
          )}
        </section>
      )}
      {activeTab === 'questions' && (
        <section className="management-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ÖĞRENCİ GİZLİLİĞİ</p>
              <h2>Uzman soruları</h2>
              <p className="muted">Soruları yalnızca ilgili öğrenci, uzmanlar ve yöneticiler görebilir. Bu ekrandan yanıt gönderilmez.</p>
            </div>
            <button className="secondary-button" onClick={() => void refreshExpertQuestions()} type="button">
              Yenile
            </button>
          </div>
          <div className="admin-question-list">
            {expertQuestions.map((question) => (
              <article className="admin-question-card" key={question.id}>
                <div className="admin-question-meta">
                  <strong>{question.studentUsername}</strong>
                  <span>{question.scenarioTitle ?? 'Genel soru'}</span>
                  <time dateTime={question.createdAt}>{formatDate(question.createdAt)}</time>
                </div>
                <p>{question.question}</p>
                {question.answer ? (
                  <div className="admin-question-answer">
                    <strong>Uzman yanıtı · {question.answeredByUsername}</strong>
                    <p>{question.answer}</p>
                  </div>
                ) : (
                  <span className="muted">Uzman yanıtı bekleniyor</span>
                )}
              </article>
            ))}
            {expertQuestions.length === 0 && (
              <p className="muted">Henüz öğrenci sorusu yok.</p>
            )}
          </div>
        </section>
      )}
      {tutorialStep !== null && (
        <AdminTutorial
          step={tutorialStep}
          steps={tutorialSteps}
          onFinish={() => void finishTutorial()}
          onNext={() => setTutorialStep((step) => (step ?? 0) + 1)}
        />
      )}
      </div>
    </main>
  );
}

function isPublishedScenario(status: 'draft' | 'published' | null): boolean {
  return status === 'published';
}

function roleLabel(role: User['role']): string {
  return role === 'teacher' ? 'Uzman' : role === 'admin' ? 'Admin' : 'Öğrenci';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('tr-TR');
}

function apiResourceUrl(value: string): string {
  return value.startsWith('/api/') ? `${API_BASE}${value.slice('/api'.length)}` : value;
}

function youtubeEmbedUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const videoId = host === 'youtu.be'
    ? url.pathname.split('/').filter(Boolean)[0]
    : ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
      ? url.pathname === '/watch'
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]
      : undefined;
  return videoId && /^[\w-]{11}$/.test(videoId)
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : null;
}

function ScenarioMedia(props: { className: string; title: string; url: string }) {
  const embedUrl = youtubeEmbedUrl(props.url);
  return embedUrl ? (
    <div className="video-embed-frame">
      <iframe
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src={embedUrl}
        title={`${props.title} videosu`}
      />
    </div>
  ) : (
    <video
      className={props.className}
      controls
      crossOrigin={props.url.startsWith('/api/') ? 'use-credentials' : undefined}
      preload="metadata"
      src={apiResourceUrl(props.url)}
    />
  );
}

function AdminTutorial(props: {
  step: number;
  steps: Array<{ title: string; text: string }>;
  onNext: () => void;
  onFinish: () => void;
}) {
  const targets = [
    'nav-content',
    'nav-accounts',
    'new-scenario',
    'nav-responses',
    'nav-questions',
    'nav-logs',
    'sidebar-logout',
  ];
  const current = props.steps[Math.min(props.step, props.steps.length - 1)];
  const targetId = targets[Math.min(props.step, targets.length - 1)];
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);
  const tipRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || !tipRef.current) return;
    target.classList.add('tutorial-target');
    const updatePosition = () => {
      const rect = target.getBoundingClientRect();
      const tipRect = tipRef.current?.getBoundingClientRect();
      if (!tipRect) return;
      const margin = 12;
      const left = window.innerWidth > 760
        ? Math.min(rect.right + margin, window.innerWidth - tipRect.width - margin)
        : Math.min(Math.max(margin, rect.left), window.innerWidth - tipRect.width - margin);
      const below = rect.bottom + margin;
      const top = below + tipRect.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, rect.top - tipRect.height - margin);
      setPosition({ top, left: Math.max(margin, left) });
      setVisible(true);
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      target.classList.remove('tutorial-target');
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [targetId]);

  return (
    <aside
      className="tutorial-coachmark"
      ref={tipRef}
      role="note"
      aria-live="polite"
      style={{ top: position.top, left: position.left, visibility: visible ? 'visible' : 'hidden' }}
    >
      <p className="eyebrow">REHBER · {Math.min(props.step + 1, props.steps.length)}/{props.steps.length}</p>
      <h2>{current.title}</h2>
      <p>{current.text}</p>
      <div className="tutorial-actions">
        <button className="text-button" onClick={props.onFinish} type="button">Atla</button>
        <button
          className="primary-button"
          onClick={props.step + 1 >= props.steps.length ? props.onFinish : props.onNext}
          type="button"
        >
          {props.step + 1 >= props.steps.length ? 'Tamamla' : 'İleri'}
        </button>
      </div>
    </aside>
  );
}

function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'account.provisioned': 'Hesap sisteme aktarıldı',
    'account.created': 'Hesap oluşturuldu',
    'account.updated': 'Hesap güncellendi',
    'account.deleted': 'Hesap silindi',
    'account.registered': 'Öğrenci kaydoldu',
    'auth.login.succeeded': 'Giriş başarılı',
    'auth.login.failed': 'Giriş başarısız',
    'auth.logout': 'Çıkış yapıldı',
    'content.created': 'İçerik oluşturuldu',
    'content.updated': 'İçerik güncellendi',
    'content.deleted': 'İçerik silindi',
    'content.published': 'İçerik yayımlandı',
    'content.unpublished': 'İçerik yayından alındı',
    'content.video.uploaded': 'Video yüklendi',
    'student.scenario.viewed': 'Senaryo görüntülendi',
    'student.response.saved': 'Yanıt kaydedildi',
  };
  return labels[action] ?? action;
}

function auditDetails(entry: AuditLog): string {
  const details = entry.details;
  if (typeof details.title === 'string') return details.title;
  if (typeof details.username === 'string') {
    const role = details.role === 'teacher' || details.role === 'admin' || details.role === 'student'
      ? ` · ${roleLabel(details.role)}`
      : '';
    return `${details.username}${role}`;
  }
  if (typeof details.answeredQuestionCount === 'number') {
    return `${details.answeredQuestionCount} yanıt alanı`;
  }
  if (Array.isArray(details.fields)) return 'Kullanıcı adı/parola alanı';
  return entry.entityId ?? '—';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
