<script setup lang="ts">
const stations = [
  { label: '待审核订单', value: '—', code: 'ORD-AUDIT' },
  { label: '物料齐套中', value: '—', code: 'KIT-WIP' },
  { label: '生产中工单', value: '—', code: 'WO-LIVE' },
  { label: '抽检待上传', value: '—', code: 'PHOTO-GATE' },
]
</script>

<template>
  <section class="dashboard">
    <header class="page-heading">
      <div>
        <p class="eyebrow">ORDER CONTROL TOWER</p>
        <h1>订单履约控制塔</h1>
      </div>
      <span class="live-stamp"><i /> 实时数据接口待接入</span>
    </header>
    <div class="metric-grid">
      <article v-for="station in stations" :key="station.code" class="metric-card">
        <span>{{ station.code }}</span
        ><strong>{{ station.value }}</strong>
        <p>{{ station.label }}</p>
      </article>
    </div>
    <section class="empty-board">
      <div class="pattern-roll" aria-hidden="true"><i /><i /><i /></div>
      <div>
        <p>工厂数据面已就绪</p>
        <h2>等待订单业务模块接入</h2>
        <span>身份、租户和权限边界已经启用。</span>
      </div>
    </section>
  </section>
</template>
