// pages/sco/app.js — Controller & SPA Router untuk SCO Performance Suite v2.0
(function () {
  'use strict';

  // ── APP STATE ──
  const state = {
    data: null,
    loading: true,
    error: null,
    currentRoute: '#ringkasan',
    selectedPeriod: null,
    selectedSales: 'ALL',
    selectedJadwal: 'ALL',
    detailSort: 'growth_desc',
    searchQuery: '',
    detailPageLimit: 100,
    kpiScoMonth: 'ALL',
    kpiScoPerson: 'ALL',
    kpiDsoMonth: 'ALL',
    kpiDsoPerson: 'ALL',
    profilSales: 'ALL',
    profilCabang: 'ALL',
    profilSearch: '',
    profilSort: 'curr_desc',
    profilTrendFilter: 'ALL',
    profilPageLimit: 100,
    theme: localStorage.getItem('sco_theme') || localStorage.getItem('theme_preference') || 'system',
    defaultSales: localStorage.getItem('sco_default_sales') || 'ALL',
  };

  let trendChartInstance = null;

  // ── UTILITY HELPERS ──
  function fmtNumber(val, decimals = 1) {
    if (val === null || val === undefined || isNaN(val)) return '0';
    return Number(val).toLocaleString('id-ID', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function fmtRupiah(val) {
    if (val === null || val === undefined || isNaN(val)) return 'Rp 0';
    return 'Rp ' + Math.round(Number(val)).toLocaleString('id-ID');
  }

  function fmtDateIndo(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function formatBulan(str) {
    if (!str) return '-';
    const s = String(str).trim();
    const iso = s.match(/^(\d{4})-(\d{2})/);
    if (iso) {
      const yr = parseInt(iso[1], 10);
      const mo = parseInt(iso[2], 10) - 1;
      const names = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      if (mo >= 0 && mo < 12) {
        return `${names[mo]} ${yr}`;
      }
    }
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      }
    } catch {}
    return str;
  }

  function parseDmsToMaps(str) {
    if (!str || typeof str !== 'string') return null;
    const m = str.match(/(\d+)[^\d]+(\d+)[^\d]+([\d.]+)[^\d]*([NSns])\s*(\d+)[^\d]+(\d+)[^\d]+([\d.]+)[^\d]*([EWew])/);
    if (m) {
      let lat = parseFloat(m[1]) + parseFloat(m[2]) / 60 + parseFloat(m[3]) / 3600;
      if (m[4].toUpperCase() === 'S') lat = -lat;
      let lon = parseFloat(m[5]) + parseFloat(m[6]) / 60 + parseFloat(m[7]) / 3600;
      if (m[8].toUpperCase() === 'W') lon = -lon;
      return `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
    }
    const cleanStr = str.replace(/[^\w\s.,-]/g, '').trim();
    if (cleanStr.length > 3) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanStr)}`;
    }
    return null;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  function getCleanScoList(allAgents) {
    const scoSet = new Set();
    (allAgents || []).forEach(a => {
      const s = String(a.sco || '').trim();
      const lower = s.toLowerCase();
      if (s && lower !== 'non sco' && lower !== 'online' && !lower.includes('total')) {
        scoSet.add(s);
      }
    });
    return Array.from(scoSet).sort();
  }

  function showToast(message, icon = 'check-circle') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa-solid fa-${icon}" style="color:var(--primary);"></i> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  window.copyText = function (text, label = 'Teks') {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      showToast(`${label} disalin ke clipboard!`, 'copy');
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(`${label} disalin!`, 'copy');
    });
  };

  // ── THEME ENGINE ──
  function applyTheme(themeName) {
    state.theme = themeName;
    localStorage.setItem('sco_theme', themeName);
    localStorage.setItem('theme_preference', themeName);

    let effective = themeName;
    if (themeName === 'system') {
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-theme', effective);
    if (effective === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }

    // Update Header Theme Icon
    const themeIcon = document.getElementById('btn-header-theme-icon');
    if (themeIcon) {
      themeIcon.className = effective === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }

    // Refresh chart colors if rendered
    if (trendChartInstance) {
      renderTrendChart();
    }
  }

  function toggleQuickTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    showToast(`Tema diubah ke ${next === 'dark' ? 'Gelap' : 'Terang'}`, next === 'dark' ? 'moon' : 'sun');
  }

  // ── DATA LOADER ──
  async function loadData() {
    state.loading = true;
    renderAppShell();

    const dataPaths = [
      './data_sco.json',
      'data_sco.json',
      '/pages/sco/data_sco.json'
    ];

    let loaded = false;
    for (const p of dataPaths) {
      try {
        const res = await fetch(`${p}?t=${Date.now()}`);
        if (res.ok) {
          const json = await res.json();
          if (json && json.periods) {
            state.data = json;
            state.loading = false;
            // Set initial period to latest
            if (json.periods_list && json.periods_list.length > 0) {
              state.selectedPeriod = json.latest_period || json.periods_list[0].code;
            }
            if (state.defaultSales && state.defaultSales !== 'ALL') {
              state.selectedSales = state.defaultSales;
            }
            loaded = true;
            break;
          }
        }
      } catch (e) {
        console.warn(`[SCO] Gagal memuat dari ${p}:`, e);
      }
    }

    if (!loaded) {
      state.loading = false;
      state.error = 'Tidak dapat memuat data SCO (data_sco.json tidak ditemukan).';
    }

    renderCurrentRoute();
  }

  // ── ROUTER ──
  function handleRoute() {
    const hash = window.location.hash || '#ringkasan';
    const validRoutes = ['#ringkasan', '#profil-agen', '#detail', '#kpi-sco', '#kpi-dso', '#settings'];
    state.currentRoute = validRoutes.includes(hash) ? hash : '#ringkasan';

    // Update nav links active state
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === state.currentRoute);
    });

    // Close mobile drawer on route navigation
    closeDrawer();

    renderCurrentRoute();
  }

  window.navigateRoute = function (route) {
    window.location.hash = route;
  };

  function renderCurrentRoute() {
    const container = document.getElementById('view-container');
    if (!container) return;

    if (state.loading) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-circle-notch fa-spin"></i>
          <p>Memuat data SCO Executive Suite...</p>
        </div>`;
      return;
    }

    if (state.error) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i>
          <p style="color:var(--danger); font-weight:700;">${state.error}</p>
          <button class="action-btn btn-secondary" onclick="window.location.reload()" style="margin-top:12px;">Coba Lagi</button>
        </div>`;
      return;
    }

    // Update Header Title & Controls
    updateHeader();

    switch (state.currentRoute) {
      case '#ringkasan':
        renderRingkasanView(container);
        break;
      case '#profil-agen':
        renderProfilAgenView(container);
        break;
      case '#detail':
        renderDetailView(container);
        break;
      case '#kpi-sco':
        renderKpiScoView(container);
        break;
      case '#kpi-dso':
        renderKpiDsoView(container);
        break;
      case '#settings':
        renderSettingsView(container);
        break;
      default:
        renderRingkasanView(container);
    }
  }

  function updateHeader() {
    const titleEl = document.getElementById('header-title-text');
    const periodBar = document.getElementById('sub-header-bar');
    const periodSelect = document.getElementById('header-period-select');
    const headerBadge = document.getElementById('header-cutoff-badge');

    const titles = {
      '#ringkasan': '<i class="fa-solid fa-chart-line" style="color:var(--primary);"></i> Ringkasan Performa',
      '#profil-agen': '<i class="fa-solid fa-store" style="color:var(--primary);"></i> Profil Tren Agen',
      '#detail': '<i class="fa-solid fa-users" style="color:var(--primary);"></i> Detail Performa Agen',
      '#kpi-sco': '<i class="fa-solid fa-bullseye" style="color:var(--primary);"></i> KPI & Insentif SCO',
      '#kpi-dso': '<i class="fa-solid fa-award" style="color:var(--primary);"></i> KPI & Insentif DSO',
      '#settings': '<i class="fa-solid fa-gear" style="color:var(--primary);"></i> Pengaturan'
    };

    if (titleEl) titleEl.innerHTML = titles[state.currentRoute] || 'SCO Suite';

    if (headerBadge && state.data) {
      headerBadge.textContent = `Cutoff: ${state.data.cutoff_date || '-'}`;
    }

    if (periodBar && periodSelect && state.data && state.data.periods_list) {
      if (state.currentRoute === '#ringkasan' || state.currentRoute === '#detail') {
        periodBar.style.display = 'flex';
        periodSelect.innerHTML = state.data.periods_list.map(p =>
          `<option value="${p.code}" ${p.code === state.selectedPeriod ? 'selected' : ''}>${p.label}</option>`
        ).join('');
      } else {
        periodBar.style.display = 'none';
      }
    }
  }

  // ── VIEW 1: RINGKASAN PERFORMA (DAILY TRX MoM) ──
  function renderRingkasanView(container) {
    if (!state.data || !state.data.periods) return;
    const period = state.data.periods[state.selectedPeriod] || state.data.periods[state.data.latest_period];
    if (!period) {
      container.innerHTML = `<div class="empty-state"><p>Data periode tidak ditemukan.</p></div>`;
      return;
    }

    const indexRows = period.index || [];

    // 4 Key Row Groups for Daily Trx Cards
    const rowTotSco = indexRows.find(r => {
      const s = String(r['SCO'] || '').trim().toLowerCase();
      return s === 'total sco';
    }) || { prev: 0, curr: 0, Growth: 0, '%': 0 };

    const rowTotNon = indexRows.find(r => {
      const s = String(r['SCO'] || '').trim().toLowerCase();
      return s === 'total non sco' || s === 'total non-sco';
    }) || { prev: 0, curr: 0, Growth: 0, '%': 0 };

    const rowOnline = indexRows.find(r => {
      const s = String(r['SCO'] || '').trim().toLowerCase();
      return s === 'online';
    }) || { prev: 0, curr: 0, Growth: 0, '%': 0 };

    const rowGrand = indexRows.find(r => {
      const s = String(r['SCO'] || '').trim().toLowerCase();
      return s === 'grand total' || s === 'total';
    }) || { prev: 0, curr: 0, Growth: 0, '%': 0 };

    function makeKpiCard(title, icon, row, colorAccent, iconBg, iconColor) {
      const valCurr = row.curr || 0;
      const valPrev = row.prev || 0;
      const growth = (row['Growth'] !== undefined && row['Growth'] !== '')
        ? Number(row['Growth'])
        : (valCurr - valPrev);
      const isPos = growth >= 0;

      return `
        <div class="metric-card" style="--card-accent: ${colorAccent};">
          <div class="metric-header">
            <span class="metric-label">${title}</span>
            <div class="metric-icon-box" style="background: ${iconBg}; color: ${iconColor};">
              <i class="${icon}"></i>
            </div>
          </div>
          <div class="metric-value">
            ${fmtNumber(valCurr, 1)} <span style="font-size:12px; font-weight:600; color:var(--text-muted); font-family:var(--font);">trx/hari</span>
          </div>
          <div class="metric-subtext">
            <span>${period.prev_name}: <strong>${fmtNumber(valPrev, 1)}</strong></span>
            <span class="badge ${isPos ? 'badge-success' : 'badge-danger'}" style="margin-left:auto;" title="Pertumbuhan Harian">
              ${isPos ? '+' : ''}${fmtNumber(growth, 1)}
            </span>
          </div>
        </div>
      `;
    }

    // Individual SCO persons for chart & actions
    const scoPersons = indexRows.filter(r => {
      const s = String(r['SCO'] || '').trim().toLowerCase();
      return !s.includes('total') && s !== 'online' && s !== 'non sco' && s !== '';
    });

    container.innerHTML = `
      <!-- 4 KPI CARDS: DAILY TRX (SCO, NON SCO, ONLINE, TOTAL) -->
      <div class="metrics-grid">
        ${makeKpiCard('TOTAL SCO (DAILY TRX)', 'fa-solid fa-user-check', rowTotSco, 'var(--primary)', 'var(--primary-light)', 'var(--primary)')}
        ${makeKpiCard('TOTAL NON SCO (DAILY TRX)', 'fa-solid fa-users', rowTotNon, '#8b5cf6', 'rgba(139, 92, 246, 0.15)', '#8b5cf6')}
        ${makeKpiCard('ONLINE (DAILY TRX)', 'fa-solid fa-globe', rowOnline, 'var(--success)', 'rgba(16, 185, 129, 0.15)', 'var(--success)')}
        ${makeKpiCard('GRAND TOTAL (DAILY TRX)', 'fa-solid fa-chart-pie', rowGrand, '#f59e0b', 'rgba(245, 158, 11, 0.15)', '#f59e0b')}
      </div>

      <!-- CHART SECTION: DAILY TRX PER SCO -->
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">
            <i class="fa-solid fa-chart-column" style="color:var(--primary);"></i>
            Perbandingan Daily Transaction SCO (${period.prev_name} vs ${period.curr_name}) (trx/hari)
          </div>
        </div>
        <div class="card-body" style="height: 340px; position: relative;">
          <canvas id="sco-trend-chart"></canvas>
        </div>
      </div>

      <!-- TABLE SECTION: DAILY TRX REKAP -->
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">
            <i class="fa-solid fa-table-list" style="color:var(--primary);"></i>
            Rekap Daily Transaction (${period.prev_name} vs ${period.curr_name})
          </div>
        </div>
        <div class="table-responsive">
          <table class="data-table" id="table-mom-sco">
            <thead>
              <tr>
                <th class="center" style="width:40px;">No</th>
                <th>SCO / Kategori</th>
                <th>Cabang</th>
                <th class="num">${period.prev_name}</th>
                <th class="num" style="color:var(--primary); font-weight:800;">${period.curr_name}</th>
                <th class="num">Growth</th>
                <th class="center" style="width:90px;">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${indexRows.map((r, i) => {
                const s = String(r['SCO'] || '').trim().toLowerCase();
                const isGrand = s === 'grand total' || s === 'total';
                const isTotal = s.includes('total');
                const isOnline = s === 'online';
                const isNonSco = s === 'non sco';
                const isPerson = !isTotal && !isOnline && !isNonSco && s !== '';

                let trClass = '';
                if (isGrand) trClass = 'class="row-total"';
                else if (isTotal) trClass = 'class="row-subtotal"';

                const valPrev = r.prev || 0;
                const valCurr = r.curr || 0;
                const growth = (r['Growth'] !== undefined && r['Growth'] !== '')
                  ? Number(r['Growth'])
                  : (valCurr - valPrev);
                const isPos = growth >= 0;

                return `
                  <tr ${trClass}>
                    <td class="center" style="font-weight:${isTotal || isGrand ? '800' : '500'};">${isTotal || isGrand ? '•' : i + 1}</td>
                    <td style="font-weight:${isTotal || isGrand ? '800' : '700'}; color:${isGrand ? 'var(--primary)' : 'inherit'};">
                      ${r.SCO || '-'}
                    </td>
                    <td>${r.CABANG ? `<span class="badge badge-info">${r.CABANG}</span>` : '-'}</td>
                    <td class="num">${fmtNumber(valPrev, 1)}</td>
                    <td class="num" style="font-weight:800; color:var(--primary);">${fmtNumber(valCurr, 1)}</td>
                    <td class="num" style="color:${isPos ? 'var(--success-text)' : 'var(--danger-text)'}; font-weight:700;">
                      ${isPos ? '+' : ''}${fmtNumber(growth, 1)}
                    </td>
                    <td class="center">
                      ${isPerson ? `
                        <button class="action-btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="window.filterToAgentDetail('${r.SCO}')">
                          <i class="fa-solid fa-arrow-right"></i> Agen
                        </button>
                      ` : ''}
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    renderTrendChart(scoPersons, period);
  }

  function renderTrendChart(scoPersons, period) {
    if (!scoPersons) {
      if (!state.data || !state.data.periods) return;
      const p = state.data.periods[state.selectedPeriod];
      if (!p || !p.index) return;
      scoPersons = p.index.filter(r => {
        const s = String(r['SCO'] || '').trim().toLowerCase();
        return !s.includes('total') && s !== 'online' && s !== 'non sco' && s !== '';
      });
      period = p;
    }

    const canvas = document.getElementById('sco-trend-chart');
    if (!canvas) return;

    if (trendChartInstance) {
      trendChartInstance.destroy();
      trendChartInstance = null;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

    // Sort by current daily trx descending
    const sorted = [...scoPersons].sort((a, b) => (b.curr || 0) - (a.curr || 0));
    const labels = sorted.map(s => s.SCO.split(' ')[0] + (s.CABANG ? ` (${s.CABANG})` : ''));
    const prevData = sorted.map(s => Number((s.prev || 0).toFixed(1)));
    const currData = sorted.map(s => Number((s.curr || 0).toFixed(1)));

    trendChartInstance = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: `${period.prev_name}`,
            data: prevData,
            backgroundColor: isDark ? 'rgba(148, 163, 184, 0.4)' : '#cbd5e1',
            borderRadius: 6,
          },
          {
            label: `${period.curr_name}`,
            data: currData,
            backgroundColor: '#0284c7',
            borderRadius: 6,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { family: 'Plus Jakarta Sans', weight: '600' } }
          },
          tooltip: {
            callbacks: {
              title: (items) => sorted[items[0].dataIndex].SCO,
              label: (context) => ` ${context.dataset.label}: ${context.parsed.y.toLocaleString('id-ID')} trx/hari`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Plus Jakarta Sans', size: 11 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { family: 'JetBrains Mono', size: 11 },
              callback: (val) => val.toLocaleString('id-ID')
            }
          }
        }
      }
    });
  }

  window.filterToAgentDetail = function (scoName) {
    if (scoName) {
      state.selectedSales = scoName;
    }
    window.location.hash = '#detail';
  };

  // ── VIEW: PROFIL TREN AGEN (HISTORI DAILY TRX JAN - OKT & SPARKLINE) ──
  const PROFIL_MONTHS = [
    { code: '0126', label: 'Jan' },
    { code: '0226', label: 'Feb' },
    { code: '0326', label: 'Mar' },
    { code: '0426', label: 'Apr' },
    { code: '0526', label: 'Mei' },
    { code: '0626', label: 'Jun' },
    { code: '0726', label: 'Jul' },
    { code: '0826', label: 'Agu' },
    { code: '0926', label: 'Sep' },
    { code: '1026', label: 'Okt' },
  ];

  function generateSparklineSvg(values, width = 74, height = 22) {
    if (!values || values.length === 0) return '';
    const pad = 2;
    const w = width - pad * 2;
    const h = height - pad * 2;

    const validVals = values.map(v => (v !== null && v !== undefined && !isNaN(v)) ? Number(v) : 0);
    const min = Math.min(...validVals);
    const max = Math.max(...validVals);
    const range = max - min;

    const lastVal = validVals[validVals.length - 1];
    const prevVal = validVals.length > 1 ? validVals[validVals.length - 2] : lastVal;
    const isUp = lastVal >= prevVal;
    const color = isUp ? '#10b981' : '#ef4444';

    const n = validVals.length;
    let points = [];
    for (let i = 0; i < n; i++) {
      const x = pad + (n > 1 ? (i / (n - 1)) * w : w / 2);
      const y = range === 0 ? pad + h / 2 : pad + h - ((validVals[i] - min) / range) * h;
      points.push({ x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) });
    }

    const polyPoints = points.map(p => `${p.x},${p.y}`).join(' ');
    const lastPoint = points[points.length - 1];

    return `
      <svg class="sparkline-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <polyline fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" points="${polyPoints}" />
        <circle cx="${lastPoint.x}" cy="${lastPoint.y}" r="2.5" fill="${color}" />
      </svg>
    `;
  }

  function getFilteredProfilAgents(allAgents) {
    if (!allAgents) return [];
    let list = allAgents;

    // Filter SCO
    if (state.profilSales && state.profilSales !== 'ALL') {
      list = list.filter(a => String(a.sco || '').trim() === state.profilSales);
    }

    // Filter Cabang
    if (state.profilCabang && state.profilCabang !== 'ALL') {
      list = list.filter(a => String(a.cabang || '').trim() === state.profilCabang);
    }

    // Search Query
    if (state.profilSearch) {
      const q = state.profilSearch.toLowerCase().trim();
      list = list.filter(a =>
        String(a.name || '').toLowerCase().includes(q) ||
        String(a.aid || '').toLowerCase().includes(q) ||
        String(a.sco || '').toLowerCase().includes(q) ||
        String(a.cabang || '').toLowerCase().includes(q)
      );
    }

    // Trend Filter
    if (state.profilTrendFilter === 'UP') {
      list = list.filter(a => {
        const vOkt = a.monthly_avg ? (parseFloat(a.monthly_avg['1026']) || 0) : 0;
        const vSep = a.monthly_avg ? (parseFloat(a.monthly_avg['0926']) || 0) : 0;
        return vOkt >= vSep;
      });
    } else if (state.profilTrendFilter === 'DOWN') {
      list = list.filter(a => {
        const vOkt = a.monthly_avg ? (parseFloat(a.monthly_avg['1026']) || 0) : 0;
        const vSep = a.monthly_avg ? (parseFloat(a.monthly_avg['0926']) || 0) : 0;
        return vOkt < vSep;
      });
    } else if (state.profilTrendFilter === 'ACTIVE_TOP') {
      list = list.filter(a => {
        const vOkt = a.monthly_avg ? (parseFloat(a.monthly_avg['1026']) || 0) : 0;
        return vOkt >= 50;
      });
    }

    // Sorting
    list = [...list].sort((a, b) => {
      const aOkt = a.monthly_avg ? (parseFloat(a.monthly_avg['1026']) || 0) : 0;
      const bOkt = b.monthly_avg ? (parseFloat(b.monthly_avg['1026']) || 0) : 0;
      const aSep = a.monthly_avg ? (parseFloat(a.monthly_avg['0926']) || 0) : 0;
      const bSep = b.monthly_avg ? (parseFloat(b.monthly_avg['0926']) || 0) : 0;
      const aDiff = aOkt - aSep;
      const bDiff = bOkt - bSep;
      const aJan = a.monthly_avg ? (parseFloat(a.monthly_avg['0126']) || 0) : 0;
      const bJan = b.monthly_avg ? (parseFloat(b.monthly_avg['0126']) || 0) : 0;

      if (state.profilSort === 'curr_desc') return bOkt - aOkt;
      if (state.profilSort === 'curr_asc') return aOkt - bOkt;
      if (state.profilSort === 'diff_desc') return bDiff - aDiff;
      if (state.profilSort === 'diff_asc') return aDiff - bDiff;
      if (state.profilSort === 'jan_desc') return bJan - aJan;
      if (state.profilSort === 'name_asc') return String(a.name || '').localeCompare(String(b.name || ''));
      return bOkt - aOkt;
    });

    return list;
  }

  function renderProfilTableRows(agents) {
    if (!agents || agents.length === 0) {
      return `
        <tr>
          <td colspan="14" class="center" style="padding: 40px 20px; color: var(--text-muted);">
            <i class="fa-solid fa-store-slash" style="font-size: 32px; opacity: 0.5; margin-bottom: 10px; display: block;"></i>
            <div style="font-size: 14px; font-weight: 600;">Tidak ada toko yang sesuai dengan kriteria pencarian atau filter.</div>
          </td>
        </tr>`;
    }

    return agents.map((a, idx) => {
      const mapsUrl = parseDmsToMaps(a.location);
      const vals = PROFIL_MONTHS.map(m => (a.monthly_avg && a.monthly_avg[m.code] !== undefined) ? Number(a.monthly_avg[m.code]) : 0);
      const maxVal = Math.max(...vals);
      const valOkt = vals[9];
      const valSep = vals[8];
      const diffMoM = valOkt - valSep;
      const isPos = diffMoM >= 0;
      const sparkSvg = generateSparklineSvg(vals, 74, 22);

      return `
        <tr>
          <td class="center" style="color:var(--text-muted); font-size:12px; font-weight:600;">${idx + 1}</td>
          <td>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 230px;">
              <div style="min-width: 0;">
                <div style="font-weight: 700; color: var(--text-main); font-size: 13px; line-height: 1.35;">${escapeHtml(a.name)}</div>
                <div style="display:flex; align-items:center; gap:6px; margin-top:2px; flex-wrap:wrap;">
                  <span style="font-size: 11px; font-family: var(--font-mono); color: var(--primary); font-weight: 600;">${escapeHtml(a.aid)}</span>
                  <span class="badge badge-purple" style="font-size: 10px; padding: 1px 6px;">${escapeHtml(a.cabang || '-')}</span>
                  <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(a.sco || '-')}</span>
                </div>
              </div>
              <div style="flex-shrink: 0; text-align: right;" title="Tren Daily Jan - Okt 2026">
                ${sparkSvg}
              </div>
            </div>
          </td>
          ${vals.map((v, i) => {
            const isLatest = i === 9;
            const isPeak = v === maxVal && maxVal > 0;
            if (isLatest) {
              return `<td class="num" style="font-weight: 800; color: var(--primary); font-size: 13px;">${fmtNumber(v, 1)}</td>`;
            }
            return `<td class="num"><span class="${isPeak ? 'val-peak' : ''}" title="${isPeak ? 'Puncak Tertinggi' : ''}">${fmtNumber(v, 1)}</span></td>`;
          }).join('')}
          <td class="num">
            <span class="badge ${isPos ? 'badge-success' : 'badge-danger'}">
              ${isPos ? '+' : ''}${fmtNumber(diffMoM, 1)}
            </span>
          </td>
          <td class="center">
            <div style="display:inline-flex; align-items:center; gap:4px;">
              <button class="btn-copy-mini" title="Salin ID Toko" onclick="window.copyText('${escapeAttr(a.aid)}', 'ID Agen')">
                <i class="fa-regular fa-copy"></i>
              </button>
              ${mapsUrl ? `
                <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-table-maps" title="Buka Google Maps">
                  <i class="fa-solid fa-location-dot"></i>
                </a>
              ` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  function renderProfilAgenView(container) {
    if (!state.data || !state.data.tren_agen) {
      container.innerHTML = `<div class="empty-state"><p>Data profil agen tidak tersedia.</p></div>`;
      return;
    }

    const allAgents = state.data.tren_agen;
    const filtered = getFilteredProfilAgents(allAgents);
    const paged = filtered.slice(0, state.profilPageLimit);

    // Dynamic Lists for Filters
    const allScoList = Array.from(new Set(allAgents.map(a => String(a.sco || '').trim()).filter(Boolean))).sort();
    const cabangList = Array.from(new Set(allAgents.map(a => String(a.cabang || '').trim()).filter(Boolean))).sort();

    // Summary KPIs across filtered agents
    const totalAgents = filtered.length;
    let countUp = 0;
    let countDown = 0;
    let sumOkt = 0;

    filtered.forEach(a => {
      const vOkt = a.monthly_avg ? (parseFloat(a.monthly_avg['1026']) || 0) : 0;
      const vSep = a.monthly_avg ? (parseFloat(a.monthly_avg['0926']) || 0) : 0;
      if (vOkt >= vSep) countUp++;
      else countDown++;
      sumOkt += vOkt;
    });

    const avgOkt = totalAgents > 0 ? (sumOkt / totalAgents) : 0;

    container.innerHTML = `
      <!-- 4 SUMMARY CARDS FOR PROFIL TREN -->
      <div class="metrics-grid">
        <div class="metric-card" style="--card-accent: var(--primary);">
          <div class="metric-header">
            <span class="metric-label">TOTAL AGEN TERFILTER</span>
            <div class="metric-icon-box" style="background: var(--primary-light); color: var(--primary);">
              <i class="fa-solid fa-store"></i>
            </div>
          </div>
          <div class="metric-value">${totalAgents.toLocaleString('id-ID')} <span style="font-size:12px; font-weight:600; color:var(--text-muted);">Toko</span></div>
          <div class="metric-subtext">
            <span>Dari total <strong>${allAgents.length.toLocaleString('id-ID')}</strong> agen</span>
          </div>
        </div>

        <div class="metric-card" style="--card-accent: var(--success);">
          <div class="metric-header">
            <span class="metric-label">TREN NAIK MoM (OKT ≥ SEP)</span>
            <div class="metric-icon-box" style="background: rgba(16, 185, 129, 0.15); color: var(--success);">
              <i class="fa-solid fa-arrow-trend-up"></i>
            </div>
          </div>
          <div class="metric-value" style="color:var(--success-text);">${countUp.toLocaleString('id-ID')} <span style="font-size:12px; font-weight:600; color:var(--text-muted);">Toko</span></div>
          <div class="metric-subtext">
            <span>${totalAgents > 0 ? ((countUp / totalAgents) * 100).toFixed(1) : 0}% bertumbuh</span>
          </div>
        </div>

        <div class="metric-card" style="--card-accent: var(--danger);">
          <div class="metric-header">
            <span class="metric-label">TREN TURUN MoM (OKT &lt; SEP)</span>
            <div class="metric-icon-box" style="background: rgba(239, 68, 68, 0.15); color: var(--danger);">
              <i class="fa-solid fa-arrow-trend-down"></i>
            </div>
          </div>
          <div class="metric-value" style="color:var(--danger-text);">${countDown.toLocaleString('id-ID')} <span style="font-size:12px; font-weight:600; color:var(--text-muted);">Toko</span></div>
          <div class="metric-subtext">
            <span>${totalAgents > 0 ? ((countDown / totalAgents) * 100).toFixed(1) : 0}% koreksi harian</span>
          </div>
        </div>

        <div class="metric-card" style="--card-accent: #f59e0b;">
          <div class="metric-header">
            <span class="metric-label">RATA-RATA DAILY TRX (OKT)</span>
            <div class="metric-icon-box" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b);">
              <i class="fa-solid fa-chart-simple"></i>
            </div>
          </div>
          <div class="metric-value">${fmtNumber(avgOkt, 1)} <span style="font-size:12px; font-weight:600; color:var(--text-muted);">trx/hari</span></div>
          <div class="metric-subtext">
            <span>Rerata transaksi harian toko terfilter</span>
          </div>
        </div>
      </div>

      <!-- FILTER CONTROLS CARD -->
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">
            <i class="fa-solid fa-filter" style="color:var(--primary);"></i>
            Filter & Pencarian Profil Agen
          </div>
          <button class="action-btn btn-secondary" onclick="window.resetProfilFilters()" style="padding:4px 10px; font-size:12px;">
            <i class="fa-solid fa-arrow-rotate-left"></i> Reset Filter
          </button>
        </div>
        <div class="card-body">
          <div class="detail-filter-grid">
            <!-- Filter SCO -->
            <div class="filter-group">
              <label class="filter-label">Kategori / SCO</label>
              <select class="form-select" onchange="window.setProfilSales(this.value)">
                <option value="ALL" ${state.profilSales === 'ALL' ? 'selected' : ''}>Semua SCO & Kategori</option>
                ${allScoList.map(s => `<option value="${s}" ${s === state.profilSales ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </div>

            <!-- Filter Cabang -->
            <div class="filter-group">
              <label class="filter-label">Cabang Wilayah</label>
              <select class="form-select" onchange="window.setProfilCabang(this.value)">
                <option value="ALL" ${state.profilCabang === 'ALL' ? 'selected' : ''}>Semua Cabang</option>
                ${cabangList.map(c => `<option value="${c}" ${c === state.profilCabang ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>

            <!-- Sort By -->
            <div class="filter-group">
              <label class="filter-label">Urutkan Berdasarkan</label>
              <select class="form-select" onchange="window.setProfilSort(this.value)">
                <option value="curr_desc" ${state.profilSort === 'curr_desc' ? 'selected' : ''}>Okt 2026 Tertinggi (Default)</option>
                <option value="curr_asc" ${state.profilSort === 'curr_asc' ? 'selected' : ''}>Okt 2026 Terendah</option>
                <option value="diff_desc" ${state.profilSort === 'diff_desc' ? 'selected' : ''}>Kenaikan Terbesar (Okt vs Sep)</option>
                <option value="diff_asc" ${state.profilSort === 'diff_asc' ? 'selected' : ''}>Penurunan Terbesar (Okt vs Sep)</option>
                <option value="jan_desc" ${state.profilSort === 'jan_desc' ? 'selected' : ''}>Jan 2026 Tertinggi</option>
                <option value="name_asc" ${state.profilSort === 'name_asc' ? 'selected' : ''}>Nama Agen (A - Z)</option>
              </select>
            </div>

            <!-- Search Input -->
            <div class="filter-group">
              <label class="filter-label">Cari Nama / ID Toko</label>
              <div class="search-input-wrap">
                <i class="fa-solid fa-magnifying-glass search-icon"></i>
                <input
                  type="text"
                  class="search-input"
                  placeholder="Ketik nama toko atau ID agen..."
                  value="${escapeHtml(state.profilSearch)}"
                  oninput="window.setProfilSearch(this.value)"
                />
              </div>
            </div>
          </div>

          <!-- QUICK FILTER TREN BUTTONS -->
          <div class="quick-filter-bar">
            <span style="font-size:12px; font-weight:700; color:var(--text-muted); margin-right:4px;">Filter Cepat:</span>
            <button class="quick-filter-btn ${state.profilTrendFilter === 'ALL' ? 'active' : ''}" onclick="window.setProfilTrendFilter('ALL')">
              Semua Tren (${totalAgents})
            </button>
            <button class="quick-filter-btn ${state.profilTrendFilter === 'UP' ? 'active' : ''}" onclick="window.setProfilTrendFilter('UP')">
              <i class="fa-solid fa-arrow-trend-up" style="color:var(--success);"></i> Tren Naik MoM (${countUp})
            </button>
            <button class="quick-filter-btn ${state.profilTrendFilter === 'DOWN' ? 'active' : ''}" onclick="window.setProfilTrendFilter('DOWN')">
              <i class="fa-solid fa-arrow-trend-down" style="color:var(--danger);"></i> Tren Turun MoM (${countDown})
            </button>
            <button class="quick-filter-btn ${state.profilTrendFilter === 'ACTIVE_TOP' ? 'active' : ''}" onclick="window.setProfilTrendFilter('ACTIVE_TOP')">
              <i class="fa-solid fa-star" style="color:#f59e0b;"></i> Top Aktif (≥ 50 trx/hari)
            </button>
          </div>
        </div>
      </div>

      <!-- TABLE SECTION: HISTORI 10 BULAN & SPARKLINE -->
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">
            <i class="fa-solid fa-chart-line" style="color:var(--primary);"></i>
            Histori & Tren Daily Transaksi Agen (Januari – Oktober 2026)
          </div>
          <span class="badge badge-info">
            Menampilkan ${paged.length.toLocaleString('id-ID')} dari ${filtered.length.toLocaleString('id-ID')} Agen
          </span>
        </div>
        <div class="table-responsive">
          <table class="data-table" id="table-profil-agen">
            <thead>
              <tr>
                <th class="center" style="width:40px;">No</th>
                <th style="min-width:240px;">Nama Agen &amp; Tren Line</th>
                <th class="num">Jan</th>
                <th class="num">Feb</th>
                <th class="num">Mar</th>
                <th class="num">Apr</th>
                <th class="num">Mei</th>
                <th class="num">Jun</th>
                <th class="num">Jul</th>
                <th class="num">Agu</th>
                <th class="num">Sep</th>
                <th class="num" style="color:var(--primary); font-weight:800;">Okt</th>
                <th class="num" style="min-width:70px;">MoM Δ</th>
                <th class="center" style="width:70px;">Aksi</th>
              </tr>
            </thead>
            <tbody>
              ${renderProfilTableRows(paged)}
            </tbody>
          </table>
        </div>

        <!-- LOAD MORE BAR -->
        <div style="padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; border-top: 1px solid var(--border-color); background: var(--bg-hover);">
          <div style="font-size: 13px; color: var(--text-muted);">
            Menampilkan <strong>${paged.length.toLocaleString('id-ID')}</strong> dari total <strong>${filtered.length.toLocaleString('id-ID')}</strong> agen yang sesuai
          </div>
          <div style="display: flex; gap: 8px;">
            ${filtered.length > state.profilPageLimit ? `
              <button class="action-btn btn-secondary" onclick="window.loadMoreProfilAgents()">
                <i class="fa-solid fa-plus"></i> Muat 100 Lagi
              </button>
              <button class="action-btn btn-secondary" onclick="window.loadAllProfilAgents()">
                Tampilkan Semua (${filtered.length.toLocaleString('id-ID')})
              </button>
            ` : `
              <span class="badge badge-success" style="padding:6px 12px;">Semua data telah ditampilkan</span>
            `}
          </div>
        </div>
      </div>
    `;
  }

  window.setProfilSales = function (val) {
    state.profilSales = val;
    state.profilPageLimit = 100;
    renderCurrentRoute();
  };

  window.setProfilCabang = function (val) {
    state.profilCabang = val;
    state.profilPageLimit = 100;
    renderCurrentRoute();
  };

  window.setProfilSearch = function (val) {
    state.profilSearch = val;
    state.profilPageLimit = 100;
    renderCurrentRoute();
  };

  window.setProfilSort = function (val) {
    state.profilSort = val;
    renderCurrentRoute();
  };

  window.setProfilTrendFilter = function (val) {
    state.profilTrendFilter = val;
    state.profilPageLimit = 100;
    renderCurrentRoute();
  };

  window.loadMoreProfilAgents = function () {
    state.profilPageLimit += 100;
    renderCurrentRoute();
  };

  window.loadAllProfilAgents = function () {
    state.profilPageLimit = 999999;
    renderCurrentRoute();
  };

  window.resetProfilFilters = function () {
    state.profilSales = 'ALL';
    state.profilCabang = 'ALL';
    state.profilSearch = '';
    state.profilSort = 'curr_desc';
    state.profilTrendFilter = 'ALL';
    state.profilPageLimit = 100;
    renderCurrentRoute();
  };

  // ── VIEW 2: DETAIL PERFORMA AGEN (TABEL RINGKAS) ──
  function getActivePeriodAgents() {
    if (!state.data || !state.data.tren_agen) return [];
    const periodCode = state.selectedPeriod || state.data.latest_period || '1026';
    const pData = (state.data.periods && state.data.periods[periodCode]) ? state.data.periods[periodCode] : null;

    const currCode = periodCode;
    const prevCode = pData ? pData.prev_code : null;

    return state.data.tren_agen.map(a => {
      let m2 = 0;
      let m3 = 0;
      if (a.monthly_avg) {
        m2 = prevCode ? (parseFloat(a.monthly_avg[prevCode]) || 0) : 0;
        m3 = currCode ? (parseFloat(a.monthly_avg[currCode]) || 0) : 0;
      } else {
        m2 = Number(a.avg_prev || 0);
        m3 = Number(a.avg_curr || 0);
      }
      const diff = m3 - m2;
      const growthPct = m2 > 0 ? (diff / m2) : 0;

      return {
        ...a,
        avg_prev: m2,
        avg_curr: m3,
        diff: diff,
        growth: growthPct
      };
    });
  }

  function getPeriodMonthLabels() {
    const periodCode = state.selectedPeriod || (state.data && state.data.latest_period) || '1026';
    const pData = (state.data && state.data.periods && state.data.periods[periodCode]) ? state.data.periods[periodCode] : null;
    
    function parseCodeToMonth(code) {
      if (!code || code.length !== 4) return '';
      const mo = code.substring(0, 2);
      const yr = '20' + code.substring(2, 4);
      return formatBulan(`${yr}-${mo}-01`);
    }

    const prevLabel = (pData && pData.prev_code) ? parseCodeToMonth(pData.prev_code) : (pData ? pData.prev_name : 'Lalu');
    const currLabel = (pData && pData.code) ? parseCodeToMonth(pData.code) : (pData ? pData.curr_name : 'Ini');

    return { prev: prevLabel, curr: currLabel };
  }

  function getFilteredAgents(allAgents) {
    const scoList = getCleanScoList(allAgents);
    const defaultSco = (state.defaultSales && scoList.includes(state.defaultSales)) ? state.defaultSales : scoList[0];

    // Ensure selectedSales points to a valid SCO
    if (!state.selectedSales || !scoList.includes(state.selectedSales)) {
      state.selectedSales = defaultSco;
    }

    let filtered = allAgents.filter(a => a.sco === state.selectedSales);

    if (state.selectedJadwal !== 'ALL') {
      const j = state.selectedJadwal.toLowerCase();
      if (j === 'senin,kamis') {
        filtered = filtered.filter(a => (a.jadwal || '').toLowerCase().includes('senin') || (a.jadwal || '').toLowerCase().includes('kamis'));
      } else if (j === 'selasa,jumat') {
        filtered = filtered.filter(a => (a.jadwal || '').toLowerCase().includes('selasa') || (a.jadwal || '').toLowerCase().includes('jumat') || (a.jadwal || '').toLowerCase().includes("jum'at"));
      } else if (j === 'rabu,sabtu') {
        filtered = filtered.filter(a => (a.jadwal || '').toLowerCase().includes('rabu') || (a.jadwal || '').toLowerCase().includes('sabtu'));
      } else if (j === 'lainnya') {
        filtered = filtered.filter(a => {
          const s = (a.jadwal || '').toLowerCase();
          return !s.includes('senin') && !s.includes('kamis') && !s.includes('selasa') && !s.includes('jumat') && !s.includes("jum'at") && !s.includes('rabu') && !s.includes('sabtu');
        });
      }
    }

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(a =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.aid || '').toLowerCase().includes(q) ||
        (a.cabang || '').toLowerCase().includes(q)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      const diffA = a.diff !== undefined ? Number(a.diff) : ((a.avg_curr || 0) - (a.avg_prev || 0));
      const diffB = b.diff !== undefined ? Number(b.diff) : ((b.avg_curr || 0) - (b.avg_prev || 0));
      const currA = Number(a.avg_curr || 0);
      const currB = Number(b.avg_curr || 0);

      if (state.detailSort === 'growth_desc') {
        return diffB - diffA;
      } else if (state.detailSort === 'growth_asc') {
        return diffA - diffB;
      } else if (state.detailSort === 'curr_desc') {
        return currB - currA;
      } else if (state.detailSort === 'curr_asc') {
        return currA - currB;
      } else if (state.detailSort === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      return diffB - diffA;
    });

    return filtered;
  }

  function renderDetailTableRows(agents) {
    if (!agents || agents.length === 0) {
      return `
        <tr>
          <td colspan="6" class="center" style="padding: 40px 20px; color: var(--text-muted);">
            <i class="fa-solid fa-store-slash" style="font-size: 32px; opacity: 0.5; margin-bottom: 10px; display: block;"></i>
            <div style="font-size: 14px; font-weight: 600;">Tidak ada toko yang sesuai dengan pencarian atau filter.</div>
          </td>
        </tr>`;
    }

    return agents.map((a, idx) => {
      const mapsUrl = parseDmsToMaps(a.location);
      const diff = Number(a.diff !== undefined ? a.diff : ((a.avg_curr || 0) - (a.avg_prev || 0)));
      const isPos = diff > 0.001;
      const isNeg = diff < -0.001;
      const diffSign = isPos ? '+' : '';
      const growthColor = isPos ? 'var(--success-text)' : (isNeg ? 'var(--danger-text)' : 'var(--text-muted)');

      return `
        <tr>
          <td class="center" style="color:var(--text-muted); font-size:12px; font-weight:600;">${idx + 1}</td>
          <td>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <div style="min-width: 0;">
                <div style="font-weight: 700; color: var(--text-main); font-size: 13px; line-height: 1.35;">${escapeHtml(a.name)}</div>
                <div style="font-size: 11px; font-family: var(--font-mono); color: var(--primary); font-weight: 600; margin-top: 2px;">
                  ${escapeHtml(a.aid)}
                </div>
              </div>
              <button class="btn-copy-mini" title="Salin Nama Toko" onclick="window.copyText('${escapeAttr(a.name)}', 'Nama Toko')">
                <i class="fa-regular fa-copy"></i>
              </button>
            </div>
          </td>
          <td class="num">${fmtNumber(a.avg_prev, 1)}</td>
          <td class="num" style="font-weight: 700; color: var(--primary);">${fmtNumber(a.avg_curr, 1)}</td>
          <td class="num">
            <span style="font-weight: 700; color: ${growthColor};">
              ${diffSign}${fmtNumber(diff, 1)}
            </span>
          </td>
          <td class="center">
            ${mapsUrl ? `
              <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-table-maps" title="Buka Google Maps">
                <i class="fa-solid fa-location-dot"></i> Maps
              </a>
            ` : `<span style="color:var(--text-muted); font-size:12px;">-</span>`}
          </td>
        </tr>`;
    }).join('');
  }

  function renderDetailPagination(totalCount) {
    if (totalCount <= state.detailPageLimit) return '';
    return `
      <div style="display: flex; justify-content: center; gap: 10px; margin-top: 16px; margin-bottom: 24px; flex-wrap: wrap;">
        <button class="action-btn btn-primary" onclick="window.loadMoreAgents()" style="padding: 9px 20px;">
          <i class="fa-solid fa-angles-down"></i> Muat Lebih Banyak (+100 Toko)
        </button>
        <button class="action-btn btn-secondary" onclick="window.loadAllAgents()" style="padding: 9px 18px;">
          <i class="fa-solid fa-table-list"></i> Tampilkan Semua (${totalCount} Toko)
        </button>
      </div>`;
  }

  function updateDetailTableData() {
    if (!state.data || !state.data.tren_agen) return;
    const tbody = document.getElementById('detail-table-tbody');
    if (!tbody) {
      renderDetailView(document.getElementById('view-container'));
      return;
    }

    const allAgents = getActivePeriodAgents();
    const filtered = getFilteredAgents(allAgents);
    const pagedAgents = filtered.slice(0, state.detailPageLimit);

    tbody.innerHTML = renderDetailTableRows(pagedAgents);

    const counterText = document.getElementById('detail-counter-text');
    if (counterText) {
      counterText.innerHTML = `Menampilkan <strong style="color:var(--text-main);">${Math.min(filtered.length, state.detailPageLimit)}</strong> dari <strong style="color:var(--text-main);">${filtered.length}</strong> Toko`;
    }

    const resetWrapper = document.getElementById('detail-reset-btn-wrapper');
    if (resetWrapper) {
      const hasFilter = state.selectedJadwal !== 'ALL' || state.searchQuery || state.detailSort !== 'growth_desc';
      resetWrapper.innerHTML = hasFilter ? `
        <button class="action-btn btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="window.resetDetailFilters()">
          <i class="fa-solid fa-xmark"></i> Reset Filter
        </button>` : '';
    }

    const paginationWrapper = document.getElementById('detail-pagination-wrapper');
    if (paginationWrapper) {
      paginationWrapper.innerHTML = renderDetailPagination(filtered.length);
    }
  }

  function renderDetailView(container) {
    if (!state.data || !state.data.tren_agen) {
      container.innerHTML = `<div class="empty-state"><p>Data agen belum tersedia.</p></div>`;
      return;
    }

    const allAgents = getActivePeriodAgents();
    const months = getPeriodMonthLabels();

    // Clean SCO personil list (only actual SCOs)
    const scoList = getCleanScoList(allAgents);
    const defaultSco = (state.defaultSales && scoList.includes(state.defaultSales)) ? state.defaultSales : scoList[0];

    // Ensure selectedSales points to a valid SCO
    if (!state.selectedSales || !scoList.includes(state.selectedSales)) {
      state.selectedSales = defaultSco;
    }

    // Schedule counts for current SCO selection
    const baseListForCounts = allAgents.filter(a => a.sco === state.selectedSales);

    const countAll = baseListForCounts.length;
    const countSK = baseListForCounts.filter(a => (a.jadwal || '').toLowerCase().includes('senin') || (a.jadwal || '').toLowerCase().includes('kamis')).length;
    const countSJ = baseListForCounts.filter(a => (a.jadwal || '').toLowerCase().includes('selasa') || (a.jadwal || '').toLowerCase().includes('jumat') || (a.jadwal || '').toLowerCase().includes("jum'at")).length;
    const countRS = baseListForCounts.filter(a => (a.jadwal || '').toLowerCase().includes('rabu') || (a.jadwal || '').toLowerCase().includes('sabtu')).length;
    const countLain = countAll - (countSK + countSJ + countRS);

    const filtered = getFilteredAgents(allAgents);
    const pagedAgents = filtered.slice(0, state.detailPageLimit);

    container.innerHTML = `
      <!-- FILTER CARD -->
      <div class="content-card" style="margin-bottom: 16px;">
        <div class="card-body" style="padding: 16px 20px;">
          <div class="detail-filter-grid">
            <div>
              <label class="filter-label"><i class="fa-solid fa-user-tie"></i> Personil SCO</label>
              <select class="form-select" id="detail-sco-select" onchange="window.setDetailSales(this.value)" style="width: 100%;">
                ${scoList.map(name => {
                  const cnt = allAgents.filter(a => a.sco === name).length;
                  return `<option value="${escapeAttr(name)}" ${name === state.selectedSales ? 'selected' : ''}>${escapeHtml(name)} (${cnt} Toko)</option>`;
                }).join('')}
              </select>
            </div>
            
            <div>
              <label class="filter-label"><i class="fa-regular fa-calendar-check"></i> Jadwal PJP</label>
              <select class="form-select" id="detail-jadwal-select" onchange="window.setDetailJadwal(this.value)" style="width: 100%;">
                <option value="ALL" ${state.selectedJadwal === 'ALL' ? 'selected' : ''}>Semua Jadwal (${countAll})</option>
                <option value="Senin,Kamis" ${state.selectedJadwal === 'Senin,Kamis' ? 'selected' : ''}>Senin - Kamis (${countSK})</option>
                <option value="Selasa,Jumat" ${state.selectedJadwal === 'Selasa,Jumat' ? 'selected' : ''}>Selasa - Jum'at (${countSJ})</option>
                <option value="Rabu,Sabtu" ${state.selectedJadwal === 'Rabu,Sabtu' ? 'selected' : ''}>Rabu - Sabtu (${countRS})</option>
                <option value="Lainnya" ${state.selectedJadwal === 'Lainnya' ? 'selected' : ''}>Lainnya (${countLain > 0 ? countLain : 0})</option>
              </select>
            </div>

            <div>
              <label class="filter-label"><i class="fa-solid fa-arrow-down-wide-short"></i> Urutan</label>
              <select class="form-select" id="detail-sort-select" onchange="window.setDetailSort(this.value)" style="width: 100%;">
                <option value="growth_desc" ${state.detailSort === 'growth_desc' ? 'selected' : ''}>🔥 Growth Tertinggi (+)</option>
                <option value="growth_asc" ${state.detailSort === 'growth_asc' ? 'selected' : ''}>📉 Growth Terendah (-)</option>
                <option value="curr_desc" ${state.detailSort === 'curr_desc' ? 'selected' : ''}>💰 Daily Ini Tertinggi</option>
                <option value="curr_asc" ${state.detailSort === 'curr_asc' ? 'selected' : ''}>🪙 Daily Ini Terendah</option>
                <option value="name_asc" ${state.detailSort === 'name_asc' ? 'selected' : ''}>🔤 Nama Toko (A-Z)</option>
              </select>
            </div>

            <div>
              <label class="filter-label"><i class="fa-solid fa-magnifying-glass"></i> Cari Toko</label>
              <div class="search-box" style="width: 100%;">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="text" class="form-input" id="detail-search-input" placeholder="Nama toko / ID agen..." value="${escapeAttr(state.searchQuery)}" oninput="window.setDetailSearch(this.value)" style="width: 100%;">
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- COUNTER & RESET BAR -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 0 4px; flex-wrap: wrap; gap: 8px;">
        <span style="font-size: 13px; font-weight: 600; color: var(--text-muted);" id="detail-counter-text">
          Menampilkan <strong style="color:var(--text-main);">${Math.min(filtered.length, state.detailPageLimit)}</strong> dari <strong style="color:var(--text-main);">${filtered.length}</strong> Toko
        </span>
        <div id="detail-reset-btn-wrapper">
          ${(state.selectedJadwal !== 'ALL' || state.searchQuery || state.detailSort !== 'growth_desc') ? `
            <button class="action-btn btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="window.resetDetailFilters()">
              <i class="fa-solid fa-xmark"></i> Reset Filter
            </button>` : ''}
        </div>
      </div>

      <!-- AGENTS TABLE CARD -->
      <div class="content-card" style="margin-bottom: 20px;">
        <div class="table-responsive">
          <table class="data-table" id="table-detail-agen">
            <thead>
              <tr>
                <th class="center" style="width: 50px;">No</th>
                <th>ID & Nama Toko</th>
                <th class="num" style="width: 140px;">${escapeHtml(months.prev)}</th>
                <th class="num" style="width: 140px;">${escapeHtml(months.curr)}</th>
                <th class="num" style="width: 120px;">Growth</th>
                <th class="center" style="width: 90px;">Aksi</th>
              </tr>
            </thead>
            <tbody id="detail-table-tbody">
              ${renderDetailTableRows(pagedAgents)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- PAGINATION BUTTONS -->
      <div id="detail-pagination-wrapper">
        ${renderDetailPagination(filtered.length)}
      </div>
    `;
  }

  window.setDetailSales = function (val) {
    state.selectedSales = val;
    state.detailPageLimit = 100;
    renderDetailView(document.getElementById('view-container'));
  };

  window.setDetailJadwal = function (val) {
    state.selectedJadwal = val;
    state.detailPageLimit = 100;
    updateDetailTableData();
  };

  window.setDetailSort = function (val) {
    state.detailSort = val;
    state.detailPageLimit = 100;
    updateDetailTableData();
  };

  window.setDetailSearch = function (val) {
    state.searchQuery = val;
    state.detailPageLimit = 100;
    updateDetailTableData();
  };

  window.resetDetailFilters = function () {
    state.selectedJadwal = 'ALL';
    state.searchQuery = '';
    state.detailSort = 'growth_desc';
    state.detailPageLimit = 100;
    renderDetailView(document.getElementById('view-container'));
  };

  window.loadMoreAgents = function () {
    state.detailPageLimit += 100;
    updateDetailTableData();
  };

  window.loadAllAgents = function () {
    state.detailPageLimit = 99999;
    updateDetailTableData();
  };

  // ── VIEW 3: KPI & INSENTIF SCO ──
  function renderKpiScoView(container) {
    if (!state.data || !state.data.kpi_sco) {
      container.innerHTML = `<div class="empty-state"><p>Data KPI SCO tidak tersedia.</p></div>`;
      return;
    }

    const allKpi = state.data.kpi_sco;
    // Extract unique months and persons
    const months = Array.from(new Set(allKpi.map(k => k.bulan))).sort().reverse();
    const persons = Array.from(new Set(allKpi.map(k => k.nama))).sort();

    let filtered = [...allKpi];
    if (state.kpiScoMonth !== 'ALL') {
      filtered = filtered.filter(k => k.bulan === state.kpiScoMonth);
    }
    if (state.kpiScoPerson !== 'ALL') {
      filtered = filtered.filter(k => k.nama === state.kpiScoPerson);
    }

    // Sort by bulan DESC (terbaru di atas), lalu score DESC
    filtered.sort((a, b) => {
      const cmpBulan = (b.bulan || '').localeCompare(a.bulan || '');
      if (cmpBulan !== 0) return cmpBulan;
      return (b.score || 0) - (a.score || 0);
    });

    const avgScore = filtered.length > 0 ? (filtered.reduce((a, b) => a + (b.score || 0), 0) / filtered.length) : 0;
    const totInsentif = filtered.reduce((a, b) => a + (b.insentif || 0), 0);

    container.innerHTML = `
      <!-- SUMMARY STATS -->
      <div class="metrics-grid">
        <div class="metric-card" style="--card-accent: var(--primary);">
          <div class="metric-header">
            <span class="metric-label">Rata-rata KPI Score</span>
            <div class="metric-icon-box"><i class="fa-solid fa-star"></i></div>
          </div>
          <div class="metric-value">${fmtNumber(avgScore, 1)} pts</div>
          <div class="metric-subtext"><span>Dari ${filtered.length} Data Penilaian</span></div>
        </div>

        <div class="metric-card" style="--card-accent: var(--success);">
          <div class="metric-header">
            <span class="metric-label">Total Estimasi Insentif</span>
            <div class="metric-icon-box"><i class="fa-solid fa-money-bill-wave"></i></div>
          </div>
          <div class="metric-value" style="color:var(--success-text);">${fmtRupiah(totInsentif)}</div>
          <div class="metric-subtext">
            <span>Periode: <strong>${state.kpiScoMonth === 'ALL' ? 'Semua Bulan (Januari - September 2026)' : formatBulan(state.kpiScoMonth)}</strong></span>
          </div>
        </div>
      </div>

      <!-- TABLE & CONTROLS -->
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">
            <i class="fa-solid fa-award" style="color:var(--primary);"></i>
            Pencapaian KPI & Estimasi Insentif SCO
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <select class="form-select" onchange="window.setKpiScoMonth(this.value)">
              <option value="ALL" ${state.kpiScoMonth === 'ALL' ? 'selected' : ''}>Semua Bulan (${allKpi.length} Data)</option>
              ${months.map(m => `<option value="${m}" ${m === state.kpiScoMonth ? 'selected' : ''}>${formatBulan(m)}</option>`).join('')}
            </select>
            <select class="form-select" onchange="window.setKpiScoPerson(this.value)">
              <option value="ALL" ${state.kpiScoPerson === 'ALL' ? 'selected' : ''}>Semua Personil</option>
              ${persons.map(p => `<option value="${p}" ${p === state.kpiScoPerson ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table" id="table-kpi-sco">
            <thead>
              <tr>
                <th class="center">No</th>
                <th>Bulan</th>
                <th>Nama SCO</th>
                <th class="num">#PJP</th>
                <th class="num">Visit %</th>
                <th class="num">Coll %</th>
                <th class="num">Trx %</th>
                <th class="num">Growth %</th>
                <th class="num">Score</th>
                <th class="num">Insentif (Rp)</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((k, idx) => {
                const s = k.score || 0;
                let badgeCls = 'badge-success';
                if (s < 70) badgeCls = 'badge-danger';
                else if (s < 85) badgeCls = 'badge-warning';

                return `
                  <tr>
                    <td class="center">${idx + 1}</td>
                    <td style="white-space:nowrap;">${formatBulan(k.bulan)}</td>
                    <td style="font-weight:700;">${k.nama}</td>
                    <td class="num">${k.pjp || 0}</td>
                    <td class="num">${fmtNumber(k.pct_visit, 1)}%</td>
                    <td class="num">${fmtNumber(k.pct_coll, 1)}%</td>
                    <td class="num">${fmtNumber(k.pct_trx, 1)}%</td>
                    <td class="num" style="color:${(k.growth || 0) >= 0 ? 'var(--success-text)' : 'var(--danger-text)'};">
                      ${(k.growth || 0) >= 0 ? '+' : ''}${fmtNumber(k.growth, 1)}%
                    </td>
                    <td class="num"><span class="badge ${badgeCls}">${fmtNumber(k.score, 1)}</span></td>
                    <td class="num" style="font-weight:700; color:var(--primary);">${fmtRupiah(k.insentif)}</td>
                  </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="8">TOTAL KESELURUHAN</td>
                <td class="num">${fmtNumber(avgScore, 1)}</td>
                <td class="num" style="color:var(--primary);">${fmtRupiah(totInsentif)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  window.setKpiScoMonth = function (val) {
    state.kpiScoMonth = val;
    renderCurrentRoute();
  };

  window.setKpiScoPerson = function (val) {
    state.kpiScoPerson = val;
    renderCurrentRoute();
  };

  // ── VIEW 4: KPI & INSENTIF DSO ──
  function renderKpiDsoView(container) {
    if (!state.data || !state.data.kpi_dso) {
      container.innerHTML = `<div class="empty-state"><p>Data KPI DSO tidak tersedia.</p></div>`;
      return;
    }

    const allDso = state.data.kpi_dso;
    const months = Array.from(new Set(allDso.map(k => k.bulan))).sort().reverse();
    const persons = Array.from(new Set(allDso.map(k => k.nama))).sort();

    let filtered = [...allDso];
    if (state.kpiDsoMonth !== 'ALL') {
      filtered = filtered.filter(k => k.bulan === state.kpiDsoMonth);
    }
    if (state.kpiDsoPerson !== 'ALL') {
      filtered = filtered.filter(k => k.nama === state.kpiDsoPerson);
    }

    // Sort by bulan DESC (terbaru di atas), lalu score DESC
    filtered.sort((a, b) => {
      const cmpBulan = (b.bulan || '').localeCompare(a.bulan || '');
      if (cmpBulan !== 0) return cmpBulan;
      return (b.score || 0) - (a.score || 0);
    });

    const avgScore = filtered.length > 0 ? (filtered.reduce((a, b) => a + (b.score || 0), 0) / filtered.length) : 0;
    const totInsentif = filtered.reduce((a, b) => a + (b.insentif || 0), 0);

    container.innerHTML = `
      <!-- SUMMARY STATS -->
      <div class="metrics-grid">
        <div class="metric-card" style="--card-accent: var(--primary);">
          <div class="metric-header">
            <span class="metric-label">Rata-rata KPI DSO</span>
            <div class="metric-icon-box"><i class="fa-solid fa-trophy"></i></div>
          </div>
          <div class="metric-value">${fmtNumber(avgScore, 1)} pts</div>
          <div class="metric-subtext"><span>Dari ${filtered.length} Data Penilaian</span></div>
        </div>

        <div class="metric-card" style="--card-accent: var(--success);">
          <div class="metric-header">
            <span class="metric-label">Total Insentif DSO</span>
            <div class="metric-icon-box"><i class="fa-solid fa-hand-holding-dollar"></i></div>
          </div>
          <div class="metric-value" style="color:var(--success-text);">${fmtRupiah(totInsentif)}</div>
          <div class="metric-subtext">
            <span>Periode: <strong>${state.kpiDsoMonth === 'ALL' ? 'Semua Bulan (November 2025 - September 2026)' : formatBulan(state.kpiDsoMonth)}</strong></span>
          </div>
        </div>
      </div>

      <!-- TABLE & CONTROLS -->
      <div class="content-card">
        <div class="card-header">
          <div class="card-title">
            <i class="fa-solid fa-list-check" style="color:var(--primary);"></i>
            Pencapaian KPI & Insentif DSO
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <select class="form-select" onchange="window.setKpiDsoMonth(this.value)">
              <option value="ALL" ${state.kpiDsoMonth === 'ALL' ? 'selected' : ''}>Semua Bulan (${allDso.length} Data)</option>
              ${months.map(m => `<option value="${m}" ${m === state.kpiDsoMonth ? 'selected' : ''}>${formatBulan(m)}</option>`).join('')}
            </select>
            <select class="form-select" onchange="window.setKpiDsoPerson(this.value)">
              <option value="ALL" ${state.kpiDsoPerson === 'ALL' ? 'selected' : ''}>Semua Personil</option>
              ${persons.map(p => `<option value="${p}" ${p === state.kpiDsoPerson ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="table-responsive">
          <table class="data-table" id="table-kpi-dso">
            <thead>
              <tr class="group-head">
                <th colspan="3">IDENTITAS</th>
                <th colspan="3">NEW MEMBER (30%)</th>
                <th colspan="3">DAILY TRX (20%)</th>
                <th colspan="3">VOUCHER (30%)</th>
                <th colspan="3">PERDANA (20%)</th>
                <th colspan="3">HASIL & INSENTIF</th>
              </tr>
              <tr>
                <th class="center">No</th>
                <th>Bulan</th>
                <th>Personil DSO</th>
                <!-- New Member -->
                <th class="num">Tgt</th>
                <th class="num">Ach</th>
                <th class="num">%</th>
                <!-- Daily Trx -->
                <th class="num">Tgt</th>
                <th class="num">Ach</th>
                <th class="num">%</th>
                <!-- Voucher -->
                <th class="num">Tgt</th>
                <th class="num">Ach</th>
                <th class="num">%</th>
                <!-- Perdana -->
                <th class="num">Tgt</th>
                <th class="num">Ach</th>
                <th class="num">%</th>
                <!-- Result -->
                <th class="num">Score</th>
                <th class="num">Mult</th>
                <th class="num">Insentif</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((d, idx) => `
                <tr>
                  <td class="center">${idx + 1}</td>
                  <td style="white-space:nowrap;">${formatBulan(d.bulan)}</td>
                  <td style="font-weight:700;">${d.nama}</td>
                  <!-- New Member -->
                  <td class="num">${fmtNumber(d.tgt_new_member, 0)}</td>
                  <td class="num">${fmtNumber(d.ach_new_member, 0)}</td>
                  <td class="num">${fmtNumber(d.pct_new_member, 1)}%</td>
                  <!-- Daily Trx -->
                  <td class="num">${fmtNumber(d.tgt_daily_trx, 1)}</td>
                  <td class="num">${fmtNumber(d.ach_daily_trx, 1)}</td>
                  <td class="num">${fmtNumber(d.pct_daily_trx, 1)}%</td>
                  <!-- Voucher -->
                  <td class="num">${fmtNumber(d.tgt_voucher, 0)}</td>
                  <td class="num">${fmtNumber(d.ach_voucher, 0)}</td>
                  <td class="num">${fmtNumber(d.pct_voucher, 1)}%</td>
                  <!-- Perdana -->
                  <td class="num">${fmtNumber(d.tgt_perdana, 0)}</td>
                  <td class="num">${fmtNumber(d.ach_perdana, 0)}</td>
                  <td class="num">${fmtNumber(d.pct_perdana, 1)}%</td>
                  <!-- Result -->
                  <td class="num"><span class="badge ${d.score >= 80 ? 'badge-success' : 'badge-warning'}">${fmtNumber(d.score, 1)}</span></td>
                  <td class="num">${fmtNumber(d.multiplier, 1)}x</td>
                  <td class="num" style="font-weight:700; color:var(--primary);">${fmtRupiah(d.insentif)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="15">TOTAL ESTIMASI INSENTIF DSO</td>
                <td class="num">${fmtNumber(avgScore, 1)}</td>
                <td></td>
                <td class="num" style="color:var(--primary);">${fmtRupiah(totInsentif)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  window.setKpiDsoMonth = function (val) {
    state.kpiDsoMonth = val;
    renderCurrentRoute();
  };

  window.setKpiDsoPerson = function (val) {
    state.kpiDsoPerson = val;
    renderCurrentRoute();
  };

  // ── VIEW 5: PENGATURAN (SETTINGS) ──
  function renderSettingsView(container) {
    // Unique list of SCO names for default profile setting
    let scoList = [];
    if (state.data && state.data.tren_agen) {
      scoList = getCleanScoList(state.data.tren_agen);
    }

    container.innerHTML = `
      <!-- THEME SETTINGS -->
      <div class="settings-section">
        <h3><i class="fa-solid fa-palette" style="color:var(--primary);"></i> Pilihan Tema Tampilan</h3>
        <p class="settings-desc">Pilih mode tampilan yang nyaman untuk mata Anda. Perubahan akan berlaku seketika di seluruh halaman.</p>
        
        <div class="theme-options">
          <div class="theme-option-card ${state.theme === 'light' ? 'active' : ''}" onclick="window.setThemeConfig('light')">
            <i class="fa-solid fa-sun" style="color:#f59e0b;"></i>
            <span>Mode Terang</span>
          </div>
          <div class="theme-option-card ${state.theme === 'dark' ? 'active' : ''}" onclick="window.setThemeConfig('dark')">
            <i class="fa-solid fa-moon" style="color:#38bdf8;"></i>
            <span>Mode Gelap</span>
          </div>
          <div class="theme-option-card ${state.theme === 'system' ? 'active' : ''}" onclick="window.setThemeConfig('system')">
            <i class="fa-solid fa-display" style="color:#8b5cf6;"></i>
            <span>Ikuti Sistem</span>
          </div>
        </div>
      </div>

      <!-- DEFAULT PROFILE -->
      <div class="settings-section">
        <h3><i class="fa-solid fa-user-gear" style="color:var(--primary);"></i> Profil SCO Default</h3>
        <p class="settings-desc">Pilih nama Anda agar saat membuka menu <strong>Detail Performa Agen</strong> otomatis memfilter toko Anda.</p>
        
        <div style="max-width: 380px;">
          <select class="form-select" id="settings-default-sales" onchange="window.setDefaultSalesConfig(this.value)" style="width:100%; padding: 10px 14px; font-size: 14px;">
            <option value="ALL">Tidak ada (Tampilkan Semua Toko)</option>
            ${scoList.map(s => `<option value="${s}" ${s === state.defaultSales ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- APP & CUTOFF INFO -->
      <div class="settings-section">
        <h3><i class="fa-solid fa-circle-info" style="color:var(--primary);"></i> Informasi Data & Sistem</h3>
        <p class="settings-desc">Status integritas data SCO Executive Performance Suite.</p>
        
        <div style="display:flex; flex-direction:column; gap:10px; font-size:13.5px; max-width:500px;">
          <div class="footer-pill">
            <span>Cutoff Data Transaksi</span>
            <strong>${state.data?.cutoff_date || '-'}</strong>
          </div>
          <div class="footer-pill">
            <span>Dibuat Pada</span>
            <strong>${state.data?.generated_at ? new Date(state.data.generated_at).toLocaleString('id-ID') : '-'}</strong>
          </div>
          <div class="footer-pill">
            <span>Total Toko & Agen</span>
            <strong>${state.data?.tren_agen?.length || 0} Agen</strong>
          </div>
          <div class="footer-pill">
            <span>Versi SPA</span>
            <strong>SCO Suite v2.0 Mobile-First</strong>
          </div>
        </div>

        <div style="margin-top: 20px;">
          <button class="action-btn btn-secondary" onclick="window.refreshDataAndCache()">
            <i class="fa-solid fa-arrows-rotate"></i> Muat Ulang & Bersihkan Cache
          </button>
        </div>
      </div>
    `;
  }

  window.setThemeConfig = function (themeName) {
    applyTheme(themeName);
    renderSettingsView(document.getElementById('view-container'));
  };

  window.setDefaultSalesConfig = function (salesName) {
    state.defaultSales = salesName;
    localStorage.setItem('sco_default_sales', salesName);
    showToast(`Profil default disimpan: ${salesName}`, 'user-check');
  };

  window.refreshDataAndCache = function () {
    showToast('Memuat ulang data terbaru...', 'rotate');
    loadData();
  };

  // ── CSV EXPORT ──
  window.exportTableCSV = function (tableId, filename = 'export.csv') {
    const table = document.getElementById(tableId);
    if (!table) return;

    let csv = [];
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cols = row.querySelectorAll('td, th');
      const rowData = [];
      cols.forEach(col => {
        let text = col.innerText.replace(/"/g, '""').trim();
        rowData.push(`"${text}"`);
      });
      if (rowData.length > 0) csv.push(rowData.join(','));
    });

    const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    showToast(`File ${filename} berhasil diunduh!`, 'file-csv');
  };

  // ── APP SHELL & NAVIGATION DRAWER ──
  function renderAppShell() {
    // Only construct once
    if (document.getElementById('app-shell-rendered')) return;

    document.body.innerHTML = `
      <div id="app-shell-rendered" style="display:flex; width:100%; min-height:100vh;">
        <!-- BACKDROP FOR MOBILE -->
        <div id="sidebar-backdrop" class="sidebar-backdrop" onclick="window.closeDrawer()"></div>

        <!-- SIDEBAR DRAWER -->
        <aside id="app-sidebar" class="app-sidebar">
          <div class="sidebar-header">
            <a href="#ringkasan" class="brand-box">
              <div class="brand-icon">
                <i class="fa-solid fa-layer-group"></i>
              </div>
              <div class="brand-text">
                <span class="brand-title">SCO SUITE</span>
                <span class="brand-subtitle">Executive System</span>
              </div>
            </a>
            <button class="sidebar-close-btn" onclick="window.closeDrawer()" aria-label="Tutup Menu">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <nav class="sidebar-nav">
            <div class="nav-heading">Menu Utama</div>
            <a href="#ringkasan" class="nav-link">
              <i class="fa-solid fa-chart-line"></i>
              <span>Ringkasan Performa</span>
            </a>
            <a href="#profil-agen" class="nav-link">
              <i class="fa-solid fa-store"></i>
              <span>Profil Tren Agen</span>
            </a>
            <a href="#detail" class="nav-link">
              <i class="fa-solid fa-users"></i>
              <span>Detail Performa Agen</span>
            </a>
            <a href="#kpi-sco" class="nav-link">
              <i class="fa-solid fa-bullseye"></i>
              <span>KPI & Insentif SCO</span>
            </a>
            <a href="#kpi-dso" class="nav-link">
              <i class="fa-solid fa-award"></i>
              <span>KPI & Insentif DSO</span>
            </a>

            <div class="nav-heading">Preferensi</div>
            <a href="#settings" class="nav-link">
              <i class="fa-solid fa-gear"></i>
              <span>Pengaturan</span>
            </a>
          </nav>

          <div class="sidebar-footer">
            <div class="footer-pill">
              <span>Cutoff Data</span>
              <strong id="drawer-cutoff-date">${state.data?.cutoff_date || '07-10-2026'}</strong>
            </div>
            <button class="action-btn btn-secondary" onclick="window.toggleQuickTheme()" style="width:100%; justify-content:center;">
              <i class="fa-solid fa-circle-half-stroke"></i> Ganti Tema
            </button>
          </div>
        </aside>

        <!-- MAIN CONTAINER -->
        <div class="app-container">
          <!-- TOP APP BAR -->
          <header class="app-header">
            <div class="header-left">
              <button class="btn-menu-toggle" onclick="window.openDrawer()" aria-label="Buka Menu">
                <i class="fa-solid fa-bars"></i>
              </button>
              <h1 class="header-page-title" id="header-title-text">
                SCO Executive Suite
              </h1>
            </div>

            <div class="header-right">
              <button class="icon-btn" onclick="window.toggleQuickTheme()" title="Ubah Tema Terang/Gelap">
                <i id="btn-header-theme-icon" class="fa-solid fa-moon"></i>
              </button>
            </div>
          </header>

          <!-- SUB-HEADER BAR (PILIHAN BULAN / PERIODE DI BAWAH HEADER) -->
          <div class="sub-header-bar" id="sub-header-bar" style="display:none;">
            <div class="sub-header-left">
              <span class="sub-header-label">
                <i class="fa-solid fa-calendar-days" style="color:var(--primary);"></i>
                Pilih Periode:
              </span>
              <select class="sub-header-select" id="header-period-select" onchange="window.setPeriod(this.value)">
              </select>
            </div>
            <div class="sub-header-right">
              <span class="badge badge-info" id="header-cutoff-badge" style="font-size:11.5px; padding: 4px 10px; border-radius: 999px;">
                Cutoff: -
              </span>
            </div>
          </div>

          <!-- VIEW CONTAINER -->
          <main class="view-container app-main" id="view-container">
          </main>
        </div>
      </div>
    `;

    applyTheme(state.theme);
  }

  window.openDrawer = function () {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
  };

  window.closeDrawer = function () {
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
  };

  window.toggleQuickTheme = toggleQuickTheme;

  window.setPeriod = function (code) {
    state.selectedPeriod = code;
    renderCurrentRoute();
  };

  window.captureReportCanvas = async function () {
    const targetEl = document.getElementById('view-container') || document.querySelector('.app-main') || document.body;
    const html2canvasFn = window.html2canvas || (window.parent && window.parent.html2canvas);
    if (!html2canvasFn) {
      throw new Error('Library html2canvas belum siap.');
    }

    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) {}
    }

    const isDark = (document.documentElement.getAttribute('data-theme') === 'dark') || document.body.classList.contains('dark-theme');
    const bgColor = isDark ? '#0b1120' : '#ffffff';

    return await html2canvasFn(targetEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: bgColor,
      windowWidth: 1080,
      onclone: (clonedDoc) => {
        clonedDoc.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        if (isDark) clonedDoc.body.classList.add('dark-theme');
        else clonedDoc.body.classList.remove('dark-theme');

        const cloneTarget = clonedDoc.getElementById('view-container') || clonedDoc.querySelector('.app-main');
        if (cloneTarget) {
          cloneTarget.style.width = '1000px';
          cloneTarget.style.maxWidth = '1000px';
          cloneTarget.style.margin = '0 auto';
          cloneTarget.style.padding = '24px';
          cloneTarget.style.boxSizing = 'border-box';
          cloneTarget.style.background = bgColor;

          // Header Laporan Eksklusif untuk WhatsApp
          const reportHeader = clonedDoc.createElement('div');
          reportHeader.style.cssText = `margin-bottom: 24px; padding-bottom: 14px; border-bottom: 2px solid ${isDark ? '#334155' : '#e2e8f0'}; display: flex; justify-content: space-between; align-items: flex-end;`;
          reportHeader.innerHTML = `
            <div>
              <div style="font-size: 20px; font-weight: 800; color: ${isDark ? '#f8fafc' : '#0f172a'}; letter-spacing: -0.3px;">
                SCO EXECUTIVE REPORT
              </div>
              <div style="font-size: 13px; color: ${isDark ? '#94a3b8' : '#64748b'}; margin-top: 3px; font-weight: 500;">
                Monitoring Transaksi Harian MoM &amp; Performa Agen
              </div>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 12px; font-weight: 700; color: ${isDark ? '#38bdf8' : '#0284c7'}; font-family: 'JetBrains Mono', monospace; background: ${isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe'}; padding: 4px 10px; border-radius: 6px;">
                Cutoff: ${state.data?.cutoff_date || '-'}
              </span>
            </div>
          `;
          cloneTarget.insertBefore(reportHeader, cloneTarget.firstChild);

          // Sembunyikan elemen navigasi / tombol aksi interaktif pada foto rekap
          clonedDoc.querySelectorAll('#table-mom-sco th:last-child, #table-mom-sco td:last-child').forEach(el => el.style.display = 'none');
          clonedDoc.querySelectorAll('button, .action-btn, .sidebar-backdrop').forEach(el => el.style.display = 'none');
        }
      }
    });
  };

  // ── INIT ──
  window.addEventListener('DOMContentLoaded', () => {
    applyTheme(state.theme);
    window.addEventListener('hashchange', handleRoute);
    loadData();
  });

  // Listen to system theme change if 'system' selected
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'system') applyTheme('system');
  });

  // Listen to storage event (from parent or other tabs)
  window.addEventListener('storage', (e) => {
    if (e.key === 'theme_preference' || e.key === 'sco_theme') {
      if (e.newValue && e.newValue !== state.theme) {
        applyTheme(e.newValue);
      }
    }
  });

  // Listen to postMessage from parent window
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'theme_change' && e.data.theme) {
      applyTheme(e.data.theme);
    }
  });

})();
