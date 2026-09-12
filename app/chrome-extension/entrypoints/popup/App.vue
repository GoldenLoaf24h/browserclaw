<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';

const agentEnabled = ref(true);
const serverConnected = ref(false);
const cursorMode = ref<'off' | 'auto' | 'always'>('always');

const cursorModeLabel = computed(() => {
  if (cursorMode.value === 'off') return 'Off';
  if (cursorMode.value === 'auto') return 'Auto';
  return 'Always';
});

const setCursorMode = async (mode: 'off' | 'auto' | 'always') => {
  cursorMode.value = mode;
  try {
    await chrome.storage.local.set({ agentCursorMode: mode });
  } catch (e) {
    console.error('Failed to save cursor mode:', e);
  }
};

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

  try {
    const local = await chrome.storage.local.get('agentCursorMode');
    if (local.agentCursorMode) {
      cursorMode.value = local.agentCursorMode;
    } else {
      cursorMode.value = 'always';
      await chrome.storage.local.set({ agentCursorMode: 'always' });
    }
  } catch {
    cursorMode.value = 'always';
  }

  await checkServerStatus();
});
</script>

<template>
  <div class="popup-box">
    <!-- Row 1: Agent Control Switch -->
    <div class="row">
      <span class="label">{{ agentEnabled ? 'Agent on' : 'Agent off' }}</span>
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
      <span class="label">{{ serverConnected ? 'Connecting' : 'Disconnected' }}</span>
      <div class="status">
        <span class="dot" :class="{ online: serverConnected }"></span>
      </div>
    </div>

    <!-- Row 3: Agent Cursor Mode 3-Step Slider -->
    <div class="cursor-row">
      <div class="cursor-header">
        <span class="label">Agent Cursor</span>
        <span class="badge">{{ cursorModeLabel }}</span>
      </div>
      <div class="segmented-control">
        <div class="segment-indicator" :class="cursorMode"></div>
        <button
          type="button"
          class="segment-btn"
          :class="{ active: cursorMode === 'off' }"
          @click="setCursorMode('off')"
        >
          Off
        </button>
        <button
          type="button"
          class="segment-btn"
          :class="{ active: cursorMode === 'auto' }"
          @click="setCursorMode('auto')"
        >
          Auto
        </button>
        <button
          type="button"
          class="segment-btn"
          :class="{ active: cursorMode === 'always' }"
          @click="setCursorMode('always')"
        >
          Always
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-box {
  width: 220px;
  padding: 14px 16px;
  box-sizing: border-box;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
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

.cursor-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px solid #f3f4f6;
}

.cursor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.badge {
  font-size: 11px;
  font-weight: 600;
  color: #3b82f6;
  background: #eff6ff;
  padding: 1px 6px;
  border-radius: 4px;
}

.segmented-control {
  position: relative;
  display: flex;
  background: #f3f4f6;
  border-radius: 8px;
  padding: 2px;
}

.segment-indicator {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: calc((100% - 4px) / 3);
  background: #ffffff;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.segment-indicator.off {
  transform: translateX(0%);
}

.segment-indicator.auto {
  transform: translateX(100%);
}

.segment-indicator.always {
  transform: translateX(200%);
}

.segment-btn {
  position: relative;
  z-index: 1;
  flex: 1;
  height: 24px;
  background: transparent;
  border: none;
  outline: none;
  font-size: 11px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: color 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.segment-btn.active {
  color: #111827;
  font-weight: 600;
}
</style>
