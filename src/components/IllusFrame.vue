<script setup lang="ts">
/**
 * The border of an old bird's-eye map, drawn round the view while an illustrated town plan is
 * in view: a blue band with a white running wave between ink and gold rules, and a sprig of
 * vine at each corner. It takes no clicks.
 */
defineProps<{ show: boolean }>();
</script>

<template>
  <div class="illus-frame" :style="{ opacity: show ? 1 : 0 }" aria-hidden="true">
    <div class="band top" />
    <div class="band bottom" />
    <div class="band left" />
    <div class="band right" />
    <svg v-for="c in ['tl', 'tr', 'bl', 'br']" :key="c" class="corner" :class="c" viewBox="0 0 90 90" width="90" height="90">
      <path d="M6 6 C 30 10, 40 26, 36 44 C 33 58, 46 66, 60 60" fill="none" stroke="#5c4a2e" stroke-width="2.2" stroke-linecap="round" />
      <path d="M6 6 C 10 30, 26 40, 44 36 C 58 33, 66 46, 60 60" fill="none" stroke="#5c4a2e" stroke-width="2.2" stroke-linecap="round" />
      <g fill="#6f8a45" stroke="#3f5232" stroke-width="1">
        <path d="M36 44 c -10 -2, -14 6, -10 12 c 6 -2, 10 -6, 10 -12 z" />
        <path d="M44 36 c -2 -10, 6 -14, 12 -10 c -2 6, -6 10, -12 10 z" />
        <path d="M60 60 c 10 -2, 16 6, 12 12 c -6 -2, -12 -6, -12 -12 z" />
        <path d="M24 22 c -2 -8, 4 -12, 9 -9 c -1 5, -4 9, -9 9 z" />
      </g>
      <g fill="#b9b04a" stroke="#6f6a2a" stroke-width="0.8">
        <circle cx="52" cy="48" r="2.6" /><circle cx="56" cy="51" r="2.4" /><circle cx="50" cy="53" r="2.4" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.band {
  position: absolute;
  background-color: #3b5a7a;
  border: 0 solid #2b2420;
  box-shadow: inset 0 0 0 2px #c9a24a;
  /* A white running wave along the band. */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='12'%3E%3Cpath d='M0 6 C 6 0, 6 12, 12 6 S 18 0, 24 6' fill='none' stroke='%23eef0e6' stroke-width='1.4'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-position: center;
}
.top,
.bottom {
  left: 0;
  right: 0;
  height: 12px;
  border-width: 1.5px 0;
}
.top {
  top: 0;
}
.bottom {
  bottom: 0;
}
.left,
.right {
  top: 0;
  bottom: 0;
  width: 12px;
  border-width: 0 1.5px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='24'%3E%3Cpath d='M6 0 C 0 6, 12 6, 6 12 S 0 18, 6 24' fill='none' stroke='%23eef0e6' stroke-width='1.4'/%3E%3C/svg%3E");
}
.left {
  left: 0;
}
.right {
  right: 0;
}
.corner {
  position: absolute;
}
.tl {
  top: 6px;
  left: 6px;
}
.tr {
  top: 6px;
  right: 6px;
  transform: scaleX(-1);
}
.bl {
  bottom: 6px;
  left: 6px;
  transform: scaleY(-1);
}
.br {
  bottom: 6px;
  right: 6px;
  transform: scale(-1, -1);
}
</style>
