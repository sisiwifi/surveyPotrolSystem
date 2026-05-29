<template>
  <section class="login-page">
    <div class="login-page__hero">
      <span class="login-page__eyebrow">surveyPotrolSystem</span>
      <h1 class="login-page__title">登录后进入统一的巡检与矢量数据工作台</h1>
      <p class="login-page__subtitle">
        当前重构版后端已迁到统一主库，开发阶段已预置 admin 与 guest 两个测试账号，登录后即可测试地图管理、矢量导入与权限守卫。
      </p>

      <div class="login-page__accounts">
        <div class="login-page__account-card">
          <span class="login-page__account-role">完全权限</span>
          <strong>admin</strong>
          <span>123456</span>
        </div>
        <div class="login-page__account-card login-page__account-card--muted">
          <span class="login-page__account-role">普通用户</span>
          <strong>guest</strong>
          <span>qwerty</span>
        </div>
      </div>
    </div>

    <form class="login-card" @submit.prevent="submitLogin">
      <div class="login-card__header">
        <h2>登录系统</h2>
        <p>请输入用户名与密码。</p>
      </div>

      <label class="login-card__field">
        <span>用户名</span>
        <input v-model.trim="form.username" type="text" autocomplete="username" placeholder="admin" :disabled="submitting">
      </label>

      <label class="login-card__field">
        <span>密码</span>
        <input v-model="form.password" type="password" autocomplete="current-password" placeholder="请输入密码" :disabled="submitting">
      </label>

      <p v-if="errorText" class="login-card__error">{{ errorText }}</p>

      <button class="login-card__submit" type="submit" :disabled="submitting">
        {{ submitting ? '登录中…' : '进入系统' }}
      </button>

      <button class="login-card__switch" type="button" :disabled="submitting" @click="fillGuestAccount">
        使用 guest 测试
      </button>
    </form>
  </section>
</template>

<script>
import { login } from '../utils/auth'

function normalizeRedirect(value) {
  return typeof value === 'string' && value.startsWith('/') ? value : '/'
}

export default {
  name: 'LoginPage',
  data() {
    return {
      form: {
        username: 'admin',
        password: '123456',
      },
      submitting: false,
      errorText: '',
    }
  },
  methods: {
    fillGuestAccount() {
      this.form.username = 'guest'
      this.form.password = 'qwerty'
      this.errorText = ''
    },
    async submitLogin() {
      if (!this.form.username || !this.form.password) {
        this.errorText = '请输入用户名和密码。'
        return
      }

      this.submitting = true
      this.errorText = ''
      try {
        await login(this.form.username, this.form.password)
        this.$router.replace(normalizeRedirect(this.$route.query?.redirect))
      } catch (err) {
        this.errorText = err instanceof Error ? err.message : '登录失败'
      } finally {
        this.submitting = false
      }
    },
  },
}
</script>

<style scoped lang="css">
.login-page {
  min-height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 440px);
  gap: 2rem;
  padding: 3rem;
  background:
    radial-gradient(circle at top left, rgba(191, 219, 254, 0.8), transparent 32%),
    radial-gradient(circle at bottom right, rgba(187, 247, 208, 0.7), transparent 34%),
    linear-gradient(135deg, #f8fafc, #eef2ff 48%, #f0fdf4);
}

.login-page__hero {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1rem;
  padding: 2rem 1rem 2rem 0;
}

.login-page__eyebrow {
  display: inline-flex;
  width: fit-content;
  border-radius: 999px;
  padding: 0.35rem 0.8rem;
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.login-page__title {
  margin: 0;
  color: #0f172a;
  font-size: clamp(2rem, 4vw, 3.3rem);
  line-height: 1.08;
  font-weight: 900;
}

.login-page__subtitle {
  margin: 0;
  max-width: 42rem;
  color: #475569;
  font-size: 1rem;
  line-height: 1.8;
}

.login-page__accounts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 220px));
  gap: 1rem;
  margin-top: 1rem;
}

.login-page__account-card {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 1rem 1.1rem;
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 24px 50px rgba(15, 23, 42, 0.08);
  color: #0f172a;
}

.login-page__account-card--muted {
  background: rgba(248, 250, 252, 0.9);
}

.login-page__account-card strong {
  font-size: 1.2rem;
}

.login-page__account-role {
  color: #0f766e;
  font-size: 0.76rem;
  font-weight: 800;
}

.login-card {
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  border-radius: 28px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.12);
}

.login-card__header h2 {
  margin: 0;
  color: #0f172a;
  font-size: 1.5rem;
  font-weight: 900;
}

.login-card__header p {
  margin: 0.35rem 0 0;
  color: #64748b;
  font-size: 0.9rem;
}

.login-card__field {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.login-card__field span {
  color: #334155;
  font-size: 0.82rem;
  font-weight: 700;
}

.login-card__field input {
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 16px;
  padding: 0.85rem 1rem;
  background: rgba(255, 255, 255, 0.98);
  color: #0f172a;
  outline: none;
}

.login-card__field input:focus {
  border-color: rgba(37, 99, 235, 0.45);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.login-card__error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.85rem;
}

.login-card__submit,
.login-card__switch {
  border: 0;
  border-radius: 16px;
  padding: 0.9rem 1rem;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
}

.login-card__submit {
  background: linear-gradient(135deg, #0f172a, #1d4ed8);
  color: white;
}

.login-card__switch {
  background: rgba(226, 232, 240, 0.8);
  color: #1e293b;
}

.login-card__submit:disabled,
.login-card__switch:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 960px) {
  .login-page {
    grid-template-columns: 1fr;
    padding: 1.5rem;
  }

  .login-page__hero {
    padding-right: 0;
  }

  .login-page__accounts {
    grid-template-columns: 1fr;
  }
}
</style>