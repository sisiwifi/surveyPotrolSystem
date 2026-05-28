import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { installAuthFetchInterceptor, restoreAuthState } from './utils/auth'
import './assets/tailwind.css'
import './assets/tag-chips.css'

restoreAuthState()
installAuthFetchInterceptor()

createApp(App).use(router).mount('#app')
