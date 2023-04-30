<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { AlchemionEditor, ParserRegistry } from '@alchemion/editor'

const container = ref(null)
onMounted(() => {
  const editor = new AlchemionEditor(container.value!, {
    showAxes: true
  })
  fetch('/mols/Fe3O4.mol')
    .then((x) => x.text())
    .then((x) => {
      const structure = ParserRegistry.get('mol')?.parse(x)
      editor.loadStructure(structure)
      editor.centerStructure(structure.id)
    })
})
</script>

<template>
  <canvas class="container" ref="container"></canvas>
</template>

<style scoped>
.container {
  display: block;
  height: 100%;
  width: 100%;
}
</style>
