<script setup lang="ts">
const route = useRoute()
</script>

<template>
  <!-- isolate: the landing backdrop (-z-10) stays inside this layout, above the body. -->
  <div class="relative isolate min-h-dvh overflow-x-clip">
    <!-- One continuous landing background from under the header down to the footer
         (the footer's own surface covers its part), so there's no seam or bare strip. -->
    <LandingBackdrop v-if="route.path === '/'" />
    <LandingHeader />
    <main id="main">
      <slot />
    </main>
    <LandingFooter />
  </div>
</template>
