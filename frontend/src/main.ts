import { createApp } from 'vue'

// Element Plus 服务组件样式（MessageBox/Message/Notification 等需要全局样式）
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'
import { pinia } from './stores'
import './styles/tokens.css'

createApp(App).use(pinia).use(router).mount('#app')
