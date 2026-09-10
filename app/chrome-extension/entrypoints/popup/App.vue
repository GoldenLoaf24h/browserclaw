<script setup lang="ts">
import { ref, onMounted } from 'vue';

const agentEnabled = ref(true);
const serverConnected = ref(false);

const checkServerStatus = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch('http://127.0.0.1:12306/ping', { signal: controller.signal });
    clearTimeout(timeout);
    serverConnected.value = res.ok;
  } catch {
    serverConnected.value = false;
  }
};

const toggleAgent = async () => {
  agentEnabled.value = !agentEnabled.value;
  try {
    await chrome.storage.session.set({ agentControlEnabled: agentEnabled.value });
  } catch (e) {
    console.error('Failed to save agent control state:', e);
  }
};

onMounted(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('enable') === '1') {
    try {
      await chrome.storage.session.set({ agentControlEnabled: true });
    } catch {}
  }
  if (urlParams.get('reload') === '1') {
    setTimeout(() => {
      try {
        chrome.runtime.reload();
      } catch {}
    }, 100);
  }

  try {
    const session = await chrome.storage.session.get('agentControlEnabled');
    agentEnabled.value = session.agentControlEnabled !== false;
  } catch {
    agentEnabled.value = true;
  }
  await checkServerStatus();
});
</script>

<template>
  <div class="popup-box">
    <!-- Row 1: Agent Control Switch -->
    <div class="row">
      <span class="label">Agent 操控</span>
      <button
        class="switch"
        :class="{ active: agentEnabled }"
        type="button"
        role="switch"
        :aria-checked="agentEnabled"
        @click="toggleAgent"
      >
        <span class="slider"></span>
      </button>
    </div>

    <!-- Row 2: Service Status Indicator -->
    <div class="row">
      <span class="label">服务状态</span>
      <div class="status">
        <span class="dot" :class="{ online: serverConnected }"></span>
        <span class="status-text">{{ serverConnected ? '正常' : '未连接' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-box {
  width: 200px;
  height: 80px;
  padding: 12px 16px;
  box-sizing: border-box;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  justifyContent: space-between;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  user-select: none;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 24px;
}

.label {
  font-size: 13px;
  font-weight: 500;
  color: #1f2937;
}

.switch {
  position: relative;
  width: 36px;
  height: 20px;
  background: #e5e7eb;
  border-radius: 9999px;
  border: none;
  cursor: pointer;
  padding: 2px;
  transition: background-color 0.2s ease;
  outline: none;
}

.switch.active {
  background: #10b981;
}

.slider {
  display: block;
  width: 16px;
  height: 16px;
  background: #ffffff;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
  transform: translateX(0);
}

.switch.active .slider {
  transform: translateX(16px);
}

.status {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  transition: background-color 0.2s ease;
}

.dot.online {
  background: #10b981;
  box-shadow: 0 0 4px rgba(16, 185, 129, 0.6);
}

.status-text {
  font-size: 12px;
  color: #4b5563;
}
</style>
