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
    searchQuery: '',
    detailPageLimit: 50,
    kpiScoMonth: 'ALL',
    kpiScoPerson: 'ALL',
    kpiDsoMonth: 'ALL',
    kpiDsoPerson: 'ALL',
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
    const validRoutes = ['#ringkasan', '#detail', '#kpi-sco', '#kpi-dso', '#settings'];
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
    const periodSelect = document.getElementById('header-period-select');
    const headerBadge = document.getElementById('header-cutoff-badge');

    const titles = {
      '#ringkasan': '<i class="fa-solid fa-chart-line" style="color:var(--primary);"></i> Ringkasan Performa',
      '#detail': '<i class="fa-solid fa-users" style="color:var(--primary);"></i> Detail Performa Agen',
      '#kpi-sco': '<i class="fa-solid fa-bullseye" style="color:var(--primary);"></i> KPI & Insentif SCO',
      '#kpi-dso': '<i class="fa-solid fa-award" style="color:var(--primary);"></i> KPI & Insentif DSO',
      '#settings': '<i class="fa-solid fa-gear" style="color:var(--primary);"></i> Pengaturan'
    };

    if (titleEl) titleEl.innerHTML = titles[state.currentRoute] || 'SCO Suite';

    if (headerBadge && state.data) {
      headerBadge.textContent = `Cutoff: ${state.data.cutoff_date || '-'}`;
    }

    if (periodSelect && state.data && state.data.periods_list) {
      if (state.currentRoute === '#ringkasan' || state.currentRoute === '#detail') {
        periodSelect.style.display = 'inline-block';
        periodSelect.innerHTML = state.data.periods_list.map(p =>
          `<option value="${p.code}" ${p.code === state.selectedPeriod ? 'selected' : ''}>${p.label}</option>`
        ).join('');
      } else {
        periodSelect.style.display = 'none';
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
          <button class="action-btn btn-secondary" onclick="window.exportTableCSV('table-mom-sco', 'Rekap_Daily_Trx_${period.code}.csv')">
            <i class="fa-solid fa-file-csv"></i> Unduh CSV
          </button>
        </div>
        <div class="table-responsive">
          <table class="data-table" id="table-mom-sco">
            <thead>
              <tr>
                <th class="center" style="width:40px;">No</th>
                <th>SCO / Kategori</th>
                <th>Cabang</th>
                <th class="num">${period.prev_name} (Daily Lalu)</th>
                <th class="num" style="color:var(--primary); font-weight:800;">${period.curr_name} (Daily Ini)</th>
                <th class="num">Growth (Daily)</th>
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
            label: `${period.prev_name} (Daily Lalu)`,
            data: prevData,
            backgroundColor: isDark ? 'rgba(148, 163, 184, 0.4)' : '#cbd5e1',
            borderRadius: 6,
          },
          {
            label: `${period.curr_name} (Daily Ini)`,
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
    state.selectedSales = scoName;
    window.location.hash = '#detail';
  };

  // ── VIEW 2: DETAIL PERFORMA AGEN ──
  function renderDetailView(container) {
    if (!state.data || !state.data.tren_agen) {
      container.innerHTML = `<div class="empty-state"><p>Data agen belum tersedia.</p></div>`;
      return;
    }

    const allAgents = state.data.tren_agen;
    const months = state.data.months || { prev: 'Lalu', curr: 'Ini' };

    // Get unique SCO list for select
    const scoSet = new Set();
    allAgents.forEach(a => { if (a.sco) scoSet.add(a.sco); });
    const scoList = Array.from(scoSet).sort();

    // Filtering
    let filtered = allAgents;

    if (state.selectedSales !== 'ALL') {
      filtered = filtered.filter(a => a.sco === state.selectedSales);
    }

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
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        (a.name || '').toLowerCase().includes(q) ||
        (a.aid || '').toLowerCase().includes(q) ||
        (a.cabang || '').toLowerCase().includes(q) ||
        (a.jadwal || '').toLowerCase().includes(q)
      );
    }

    // Schedule counts for current SCO selection
    const baseListForPills = state.selectedSales === 'ALL' ? allAgents : allAgents.filter(a => a.sco === state.selectedSales);
    const countAll = baseListForPills.length;
    const countSK = baseListForPills.filter(a => (a.jadwal || '').toLowerCase().includes('senin') || (a.jadwal || '').toLowerCase().includes('kamis')).length;
    const countSJ = baseListForPills.filter(a => (a.jadwal || '').toLowerCase().includes('selasa') || (a.jadwal || '').toLowerCase().includes('jumat') || (a.jadwal || '').toLowerCase().includes("jum'at")).length;
    const countRS = baseListForPills.filter(a => (a.jadwal || '').toLowerCase().includes('rabu') || (a.jadwal || '').toLowerCase().includes('sabtu')).length;
    const countLain = countAll - (countSK + countSJ + countRS);

    const pagedAgents = filtered.slice(0, state.detailPageLimit);

    container.innerHTML = `
      <!-- CONTROLS & FILTER BAR -->
      <div class="content-card" style="margin-bottom: 16px;">
        <div class="card-body" style="padding: 16px 20px;">
          <div class="filter-bar" style="margin-bottom: 12px;">
            <div style="min-width: 200px;">
              <select class="form-select" id="detail-sco-select" onchange="window.setDetailSales(this.value)" style="width: 100%;">
                <option value="ALL">Semua Personil SCO (${allAgents.length} toko)</option>
                ${scoList.map(name => `<option value="${name}" ${name === state.selectedSales ? 'selected' : ''}>${name}</option>`).join('')}
              </select>
            </div>
            
            <div class="search-box">
              <i class="fa-solid fa-magnifying-glass"></i>
              <input type="text" class="form-input" id="detail-search-input" placeholder="Cari nama toko, ID agen, cabang..." value="${state.searchQuery}" oninput="window.setDetailSearch(this.value)">
            </div>
          </div>

          <!-- JADWAL PILLS -->
          <div class="pill-group">
            <button class="filter-pill ${state.selectedJadwal === 'ALL' ? 'active' : ''}" onclick="window.setDetailJadwal('ALL')">
              Semua Jadwal (${countAll})
            </button>
            <button class="filter-pill ${state.selectedJadwal === 'Senin,Kamis' ? 'active' : ''}" onclick="window.setDetailJadwal('Senin,Kamis')">
              Senin - Kamis (${countSK})
            </button>
            <button class="filter-pill ${state.selectedJadwal === 'Selasa,Jumat' ? 'active' : ''}" onclick="window.setDetailJadwal('Selasa,Jumat')">
              Selasa - Jum'at (${countSJ})
            </button>
            <button class="filter-pill ${state.selectedJadwal === 'Rabu,Sabtu' ? 'active' : ''}" onclick="window.setDetailJadwal('Rabu,Sabtu')">
              Rabu - Sabtu (${countRS})
            </button>
            <button class="filter-pill ${state.selectedJadwal === 'Lainnya' ? 'active' : ''}" onclick="window.setDetailJadwal('Lainnya')">
              Lainnya (${countLain > 0 ? countLain : 0})
            </button>
          </div>
        </div>
      </div>

      <!-- COUNTER -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding: 0 4px;">
        <span style="font-size: 13px; font-weight: 600; color: var(--text-muted);">
          Menampilkan <strong style="color:var(--text-main);">${Math.min(filtered.length, state.detailPageLimit)}</strong> dari <strong style="color:var(--text-main);">${filtered.length}</strong> Toko
        </span>
        ${state.selectedSales !== 'ALL' ? `
          <button class="action-btn btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="window.setDetailSales('ALL')">
            <i class="fa-solid fa-xmark"></i> Reset Filter SCO
          </button>` : ''}
      </div>

      <!-- AGENT CARDS GRID -->
      ${filtered.length === 0 ? `
        <div class="empty-state">
          <i class="fa-solid fa-store-slash"></i>
          <p>Tidak ada toko yang sesuai dengan pencarian atau filter.</p>
        </div>
      ` : `
        <div class="agent-grid">
          ${pagedAgents.map(a => {
            const mapsUrl = parseDmsToMaps(a.location);
            const growth = (a.growth || 0) * 100;
            const isPos = growth >= 0;
            return `
              <div class="store-card">
                <div class="store-card-header">
                  <div>
                    <div class="store-title">${a.name}</div>
                    <div class="store-id">${a.aid}</div>
                  </div>
                  <span class="badge ${a.status === '1' ? 'badge-success' : 'badge-warning'}">
                    ${a.status === '1' ? 'Aktif' : 'Non-aktif'}
                  </span>
                </div>

                <div class="store-meta">
                  <span class="badge badge-info"><i class="fa-solid fa-user-tie"></i> ${a.sco || 'NON SCO'}</span>
                  <span class="badge badge-purple"><i class="fa-solid fa-building"></i> ${a.cabang || '-'}</span>
                  ${a.jadwal ? `<span class="badge badge-warning"><i class="fa-regular fa-calendar-check"></i> ${a.jadwal}</span>` : ''}
                </div>

                <div class="store-stats">
                  <div class="stat-item">
                    <span class="stat-label">${months.prev} (Lalu)</span>
                    <span class="stat-val">${fmtNumber(a.avg_prev)}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label" style="color:var(--primary); font-weight:700;">${months.curr} (Ini)</span>
                    <span class="stat-val" style="color:var(--primary);">${fmtNumber(a.avg_curr)}</span>
                  </div>
                  <div class="stat-item">
                    <span class="stat-label">Growth</span>
                    <span class="stat-val" style="color:${isPos ? 'var(--success-text)' : 'var(--danger-text)'};">
                      ${isPos ? '+' : ''}${fmtNumber(growth, 1)}%
                    </span>
                  </div>
                </div>

                <div class="store-actions">
                  <button class="btn-card-action" onclick="window.copyText('${a.name.replace(/'/g, "\\'")}', 'Nama Toko')">
                    <i class="fa-regular fa-copy"></i> Salin Nama
                  </button>
                  ${mapsUrl ? `
                    <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-card-action btn-card-maps">
                      <i class="fa-solid fa-location-dot"></i> Maps
                    </a>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>

        ${filtered.length > state.detailPageLimit ? `
          <div style="text-align: center; margin-top: 24px;">
            <button class="action-btn btn-primary" onclick="window.loadMoreAgents()" style="padding: 10px 24px;">
              <i class="fa-solid fa-angles-down"></i> Muat Lebih Banyak (+50 Toko)
            </button>
          </div>
        ` : ''}
      `}
    `;
  }

  window.setDetailSales = function (val) {
    state.selectedSales = val;
    state.detailPageLimit = 50;
    renderCurrentRoute();
  };

  window.setDetailJadwal = function (val) {
    state.selectedJadwal = val;
    state.detailPageLimit = 50;
    renderCurrentRoute();
  };

  window.setDetailSearch = function (val) {
    state.searchQuery = val;
    state.detailPageLimit = 50;
    renderDetailView(document.getElementById('view-container'));
  };

  window.loadMoreAgents = function () {
    state.detailPageLimit += 50;
    renderDetailView(document.getElementById('view-container'));
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

    // Default month to latest available
    if (state.kpiScoMonth === 'ALL' && months.length > 0) {
      state.kpiScoMonth = months[0];
    }

    let filtered = allKpi;
    if (state.kpiScoMonth !== 'ALL') {
      filtered = filtered.filter(k => k.bulan === state.kpiScoMonth);
    }
    if (state.kpiScoPerson !== 'ALL') {
      filtered = filtered.filter(k => k.nama === state.kpiScoPerson);
    }

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
          <div class="metric-subtext"><span>Dari ${filtered.length} Personil SCO</span></div>
        </div>

        <div class="metric-card" style="--card-accent: var(--success);">
          <div class="metric-header">
            <span class="metric-label">Total Estimasi Insentif</span>
            <div class="metric-icon-box"><i class="fa-solid fa-money-bill-wave"></i></div>
          </div>
          <div class="metric-value" style="color:var(--success-text);">${fmtRupiah(totInsentif)}</div>
          <div class="metric-subtext"><span>Periode ${fmtDateIndo(state.kpiScoMonth)}</span></div>
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
              <option value="ALL">Semua Bulan</option>
              ${months.map(m => `<option value="${m}" ${m === state.kpiScoMonth ? 'selected' : ''}>${fmtDateIndo(m)}</option>`).join('')}
            </select>
            <select class="form-select" onchange="window.setKpiScoPerson(this.value)">
              <option value="ALL">Semua Personil</option>
              ${persons.map(p => `<option value="${p}" ${p === state.kpiScoPerson ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
            <button class="action-btn btn-secondary" onclick="window.exportTableCSV('table-kpi-sco', 'KPI_Insentif_SCO.csv')">
              <i class="fa-solid fa-file-csv"></i> CSV
            </button>
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
                    <td style="white-space:nowrap;">${fmtDateIndo(k.bulan)}</td>
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

    if (state.kpiDsoMonth === 'ALL' && months.length > 0) {
      state.kpiDsoMonth = months[0];
    }

    let filtered = allDso;
    if (state.kpiDsoMonth !== 'ALL') {
      filtered = filtered.filter(k => k.bulan === state.kpiDsoMonth);
    }
    if (state.kpiDsoPerson !== 'ALL') {
      filtered = filtered.filter(k => k.nama === state.kpiDsoPerson);
    }

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
          <div class="metric-subtext"><span>Dari ${filtered.length} Personil DSO</span></div>
        </div>

        <div class="metric-card" style="--card-accent: var(--success);">
          <div class="metric-header">
            <span class="metric-label">Total Insentif DSO</span>
            <div class="metric-icon-box"><i class="fa-solid fa-hand-holding-dollar"></i></div>
          </div>
          <div class="metric-value" style="color:var(--success-text);">${fmtRupiah(totInsentif)}</div>
          <div class="metric-subtext"><span>Periode ${fmtDateIndo(state.kpiDsoMonth)}</span></div>
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
              <option value="ALL">Semua Bulan</option>
              ${months.map(m => `<option value="${m}" ${m === state.kpiDsoMonth ? 'selected' : ''}>${fmtDateIndo(m)}</option>`).join('')}
            </select>
            <select class="form-select" onchange="window.setKpiDsoPerson(this.value)">
              <option value="ALL">Semua Personil</option>
              ${persons.map(p => `<option value="${p}" ${p === state.kpiDsoPerson ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
            <button class="action-btn btn-secondary" onclick="window.exportTableCSV('table-kpi-dso', 'KPI_Insentif_DSO.csv')">
              <i class="fa-solid fa-file-csv"></i> CSV
            </button>
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
                  <td style="white-space:nowrap;">${fmtDateIndo(d.bulan)}</td>
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
      const set = new Set();
      state.data.tren_agen.forEach(a => { if (a.sco) set.add(a.sco); });
      scoList = Array.from(set).sort();
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
              <select class="header-select" id="header-period-select" onchange="window.setPeriod(this.value)" style="display:none;">
              </select>
              <span class="badge badge-info" id="header-cutoff-badge" style="font-size:11px;">
                Cutoff: -
              </span>
              <button class="icon-btn" onclick="window.toggleQuickTheme()" title="Ubah Tema Terang/Gelap">
                <i id="btn-header-theme-icon" class="fa-solid fa-moon"></i>
              </button>
            </div>
          </header>

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
