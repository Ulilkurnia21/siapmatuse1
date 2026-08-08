// =====================================================================
// MODUL DISIPLIN GURU (DASHBOARD PIMPINAN)
// Mengambil data langsung dari Supabase tanpa lewat Google Script
// =====================================================================

async function loadPimpinanDisiplin() {
  const container = document.getElementById('pimpinan_disiplin_container');
  if (!container) return;
  
  container.innerHTML = `
    <h4 style="color:#2e7d32; margin-bottom:10px; text-align:left;">📋 DISIPLIN GURU HARI INI</h4>
    <p style="color:#aaa; font-size:13px; text-align:left;">Memuat data absensi dan jadwal... ⏳</p>
  `;

  try {
    // 1. Dapatkan hari ini
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const today = new Date();
    const hariIniStr = days[today.getDay()];
    // Jika testing saat libur (misal Minggu), uncomment baris di bawah dan ganti hari
    // const hariIniStr = 'Senin'; 

    // Tanggal hari ini format YYYY-MM-DD
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayDateStr = `${yyyy}-${mm}-${dd}`;

    // 2. Ambil jadwal hari ini dari Supabase
    const { data: jadwalData, error: jadwalErr } = await supaClient
      .from('jadwal')
      .select('username_guru, kelas, jam, mapel')
      .eq('hari', hariIniStr);
    
    if (jadwalErr) throw jadwalErr;

    if (!jadwalData || jadwalData.length === 0) {
      container.innerHTML = `
        <h4 style="color:#2e7d32; margin-bottom:10px; text-align:left;">📋 DISIPLIN GURU HARI INI</h4>
        <p style="color:#aaa; font-size:13px; text-align:left;">Tidak ada jadwal mengajar pada hari ${hariIniStr}.</p>
      `;
      return;
    }

    // 3. Ambil absensi hari ini
    // Cukup ambil username, kelas, jam (jika guru sdh absen 1 siswa saja, dianggap sdh absen)
    const { data: absenData, error: absenErr } = await supaClient
      .from('absensi')
      .select('username_guru, kelas, jam')
      .eq('tanggal', todayDateStr);
    if (absenErr) throw absenErr;

    // 4. Ambil jurnal hari ini
    const { data: jurnalData, error: jurnalErr } = await supaClient
      .from('jurnal')
      .select('username_guru')
      .eq('tanggal', todayDateStr);
    if (jurnalErr) throw jurnalErr;

    // 5. Ambil nama guru untuk dipasangkan dengan username
    const { data: guruData, error: guruErr } = await supaClient
      .from('data_guru')
      .select('username, nama');
    if (guruErr) throw guruErr;

    const mapNamaGuru = {};
    guruData.forEach(g => { mapNamaGuru[g.username] = g.nama; });

    // =======================================================
    // PROSES KALKULASI DISIPLIN
    // =======================================================
    
    // A. Kumpulkan jadwal per guru
    // Format: guruSchedules[username] = [{kelas, jam, mapel}, ...]
    const guruSchedules = {};
    jadwalData.forEach(j => {
      if (!guruSchedules[j.username_guru]) guruSchedules[j.username_guru] = [];
      guruSchedules[j.username_guru].push(j);
    });

    // B. Buat set absensi yang sudah diisi guru
    // Format identifier unik: "username_guru|kelas|jam"
    const absenSet = new Set();
    if (absenData) {
      absenData.forEach(a => {
        absenSet.add(`${a.username_guru}|${a.kelas}|${a.jam}`);
      });
    }

    // C. Buat set jurnal yang sudah diisi
    const jurnalSet = new Set();
    if (jurnalData) {
      jurnalData.forEach(j => {
        jurnalSet.add(j.username_guru);
      });
    }

    // D. Hitung kedisiplinan per guru (Cross-check jadwal vs absensi)
    const hasilDisiplin = [];
    
    for (const username in guruSchedules) {
      const jadwals = guruSchedules[username];
      const missedClasses = []; 
      
      jadwals.forEach(j => {
        const key = `${username}|${j.kelas}|${j.jam}`;
        if (!absenSet.has(key)) {
          missedClasses.push({ kelas: j.kelas, jam: j.jam, mapel: j.mapel });
        }
      });

      const namaGuru = mapNamaGuru[username] || username;
      const isJurnalOke = jurnalSet.has(username);

      hasilDisiplin.push({
        namaGuru: namaGuru,
        username: username,
        isAbsenOke: missedClasses.length === 0,
        missedClasses: missedClasses, 
        isJurnalOke: isJurnalOke
      });
    }

    // Sortir: Guru yang absensinya belum lengkap (bermasalah) ditaruh di atas
    hasilDisiplin.sort((a, b) => {
      if (a.isAbsenOke === b.isAbsenOke) {
        return a.namaGuru.localeCompare(b.namaGuru);
      }
      return a.isAbsenOke ? 1 : -1;
    });

    renderTabelDisiplin(hasilDisiplin, hariIniStr);

  } catch (error) {
    console.error("Disiplin Error:", error);
    container.innerHTML = `<p style="color:red; font-size:14px;">Gagal memuat disiplin: ${error.message}</p>`;
  }
}

function renderTabelDisiplin(disiplin, hariIniStr) {
  const container = document.getElementById('pimpinan_disiplin_container');
  if (!container) return;

  let html = `
    <h4 style="color:#2e7d32; margin-bottom:10px; text-align:left;">📋 DISIPLIN GURU HARI INI (${hariIniStr.toUpperCase()})</h4>
  `;

  if (disiplin && disiplin.length > 0) {
    html += `
      <div class="table-container" style="margin-top:10px;">
        <table class="disiplin-table">
          <thead>
            <tr>
              <th class="disiplin-nama-col">Nama Guru</th>
              <th class="disiplin-status-desktop">Status Absen Kelas</th>
              <th class="disiplin-status-desktop">Status Jurnal Harian</th>
            </tr>
          </thead>
          <tbody>
    `;

    disiplin.forEach(d => {
      // 1. Render Status Absen
      let absenBadge = '';
      if (d.isAbsenOke) {
        absenBadge = `<span class="disiplin-badge disiplin-ok">✅ Absen Oke</span>`;
      } else {
        let pesanDetail = '';
        d.missedClasses.forEach(p => {
          pesanDetail += `<div class="disiplin-detail">Absen di Kelas <b>${p.kelas}</b> belum diisi pada jam ${p.jam}</div>`;
        });
        absenBadge = `<span class="disiplin-badge disiplin-warn">⚠️ Belum Lengkap</span>${pesanDetail}`;
      }

      // 2. Render Status Jurnal
      let jurnalBadge = d.isJurnalOke 
        ? `<span class="disiplin-badge disiplin-ok">✅ Jurnal Oke</span>`
        : `<span class="disiplin-badge disiplin-warn">⚠️ Belum membuat jurnal harian</span>`;

      html += `
        <tr>
          <td class="disiplin-nama-col">
            <div class="disiplin-nama">${d.namaGuru}</div>
            <div class="disiplin-status-mobile">
              <div style="margin-bottom:8px;">${absenBadge}</div>
              <div>${jurnalBadge}</div>
            </div>
          </td>
          <td class="disiplin-status-desktop">${absenBadge}</td>
          <td class="disiplin-status-desktop">${jurnalBadge}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;
  } else {
    html += `<p style="color:#aaa; font-size:13px; text-align:left;">Data disiplin belum tersedia.</p>`;
  }

  container.innerHTML = html;
}

// =====================================================================
// MODUL KEHADIRAN (DASHBOARD PIMPINAN)
// =====================================================================

async function renderPimpinanKehadiran(forceRefresh = false) {
  const profil = App.user.profil;
  const roleLower = App.user.role ? App.user.role.toLowerCase() : '';
  
  if (roleLower !== 'pimpinan') {
    document.getElementById('pimpinan_kehadiran').innerHTML = '<div class="form-section"><p>Akses ditolak. Menu ini khusus Pimpinan.</p></div>';
    return;
  }

  // Cek cache browser (TTL 10 menit)
  if (forceRefresh !== true) {
    const cached = AppCache.get('dashboardKehadiran');
    if (cached) {
      tampilkanDashboardPimpinan(cached, false);
      return;
    }
  }

  showLoading(true, 'Memuat Dasbor Kehadiran dari Supabase... (Tergantung koneksi internet)');

  try {
    const today = new Date();
    
    // Tentukan Batas Tanggal Semester Ini (Juli s/d Des ATAU Jan s/d Jun)
    let startOfSemester;
    if (today.getMonth() >= 6) { // Juli (index 6) - Des
      startOfSemester = new Date(today.getFullYear(), 6, 1);
    } else { // Jan - Jun
      startOfSemester = new Date(today.getFullYear(), 0, 1);
    }
    
    // Tentukan Batas Bulan dan Minggu
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1; // Senin=0, Minggu=6
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    startOfWeek.setHours(0,0,0,0);

    // Format YYYY-MM-DD
    const formatDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };

    const startSemesterStr = formatDate(startOfSemester);
    const startMonthStr = formatDate(startOfMonth);
    const startWeekStr = formatDate(startOfWeek);
    const todayStr = formatDate(today);

    // ==========================================
    // FASE 1: FETCH DATA DARI SUPABASE (PAGINASI)
    // ==========================================
    let allAbsensi = [];
    let page = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supaClient
        .from('absensi')
        .select('tanggal, status, kelas, nis, nama')
        .gte('tanggal', startSemesterStr)
        .range(page * limit, (page + 1) * limit - 1);
        
      if (error) throw error;
      if (data && data.length > 0) {
        allAbsensi.push(...data);
        if (data.length < limit) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }
    }

    // Ambil Daftar Kelas dari tabel kelas
    const { data: kelasData } = await supaClient.from('data_kelas').select('kelas').order('kelas', { ascending: true });
    const daftarKelas = kelasData ? kelasData.map(k => k.kelas) : [];

    // ==========================================
    // FASE 2: AGREGASI DATA
    // ==========================================
    const rekap = {
      hariIni: { H:0, I:0, S:0, C:0, T:0, A:0, perKelas: {} },
      mingguIni: { H:0, I:0, S:0, C:0, T:0, A:0 },
      bulanIni: { H:0, I:0, S:0, C:0, T:0, A:0 },
      total: { H:0, I:0, S:0, C:0, T:0, A:0 } // Semester berjalan
    };

    // Dictionary untuk menghitung prioritas kehadiran harian per siswa di hari ini (jika diabsen beda jam dgn status beda)
    // Prioritas: Alpa > Cabut > Sakit > Izin > Terlambat > Hadir
    const prioritas = { 'A': 6, 'C': 5, 'S': 4, 'I': 3, 'T': 2, 'H': 1 };
    const statusText = { 'A': 'Alpa', 'C': 'Cabut', 'S': 'Sakit', 'I': 'Izin', 'T': 'Telat', 'H': 'Hadir' };
    const absensiHariIniPerSiswa = {}; 

    allAbsensi.forEach(row => {
      const tgl = row.tanggal; // format YYYY-MM-DD
      const stat = row.status || 'H';
      
      // Tambah ke Total
      if (rekap.total[stat] !== undefined) rekap.total[stat]++;

      // Tambah ke Bulan Ini
      if (tgl >= startMonthStr) {
        if (rekap.bulanIni[stat] !== undefined) rekap.bulanIni[stat]++;
      }

      // Tambah ke Minggu Ini
      if (tgl >= startWeekStr) {
        if (rekap.mingguIni[stat] !== undefined) rekap.mingguIni[stat]++;
      }

      // Khusus Hari Ini: Pakai logika filter prioritas jika absen di multiple jam
      if (tgl === todayStr) {
        const key = `${row.nis}_${row.kelas}`;
        if (!absensiHariIniPerSiswa[key]) {
          absensiHariIniPerSiswa[key] = { nis: row.nis, nama: row.nama, kelas: row.kelas, statusKode: stat };
        } else {
          const prevStatus = absensiHariIniPerSiswa[key].statusKode;
          const currPrio = prioritas[stat] || 0;
          const prevPrio = prioritas[prevStatus] || 0;
          if (currPrio > prevPrio) {
            absensiHariIniPerSiswa[key].statusKode = stat;
          }
        }
      }
    });

    // Proses rekap Hari Ini berdasarkan final status dari dictionary
    Object.values(absensiHariIniPerSiswa).forEach(s => {
      const stat = s.statusKode;
      const kls = s.kelas;
      
      // Rekap global hari ini
      if (rekap.hariIni[stat] !== undefined) rekap.hariIni[stat]++;
      
      // Init per kelas jika blm ada
      if (!rekap.hariIni.perKelas[kls]) {
        rekap.hariIni.perKelas[kls] = { H:0, I:0, S:0, C:0, T:0, A:0, tidakHadir: [] };
      }
      
      // Rekap per kelas hari ini
      if (rekap.hariIni.perKelas[kls][stat] !== undefined) {
        rekap.hariIni.perKelas[kls][stat]++;
      }

      // Masukkan ke array tidak hadir jika bukan H
      if (stat !== 'H') {
        rekap.hariIni.perKelas[kls].tidakHadir.push({
          nama: s.nama,
          statusKode: stat,
          statusTeks: statusText[stat]
        });
      }
    });

    // Urutkan siswa tidak hadir secara abjad
    Object.values(rekap.hariIni.perKelas).forEach(k => {
      k.tidakHadir.sort((a, b) => a.nama.localeCompare(b.nama));
    });

    // Simpan raw data untuk keperluan filtering widget Top 10
    const resultPayload = {
      success: true,
      meta: { daftarKelas: daftarKelas },
      rekap: rekap,
      rawDataTop10: allAbsensi.filter(a => a.status !== 'H' && a.status !== null) // Hanya simpan yg non-hadir di memory
    };

    AppCache.set('dashboardKehadiran', resultPayload, 10); // Cache 10 menit
    
    showLoading(false);
    tampilkanDashboardPimpinan(resultPayload, forceRefresh === true);

  } catch (err) {
    showLoading(false);
    showError('Gagal memuat dasbor kehadiran: ' + err.message);
  }
}

function tampilkanDashboardPimpinan(data, forceRefresh = false) {
  const meta = data.meta;
  const rekap = data.rekap;

  let html = `
  <div class="form-section" style="margin-bottom: 20px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
      <h2 style="color:#1e88e5; margin:0;">📊 DASBOR KEHADIRAN SISWA</h2>
      <button class="btn btn-warning" onclick="renderPimpinanKehadiran(true)" style="padding: 8px 15px; font-size: 13px; font-weight: bold; border-radius: 8px;">🔄 SEGARKAN DATA</button>
    </div>
    
    <div class="form-grid" style="margin-top:20px; gap:15px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
      
      <!-- Hari Ini -->
      <div class="form-section" style="padding: 15px; margin-bottom:0;">
        <h4 style="margin-top:0; color:#333; text-align:center; border-bottom:1px solid #ddd; padding-bottom:8px;">Hari Ini</h4>
        <div style="display:flex; justify-content:space-between; gap:2px; margin-top:10px;">
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Hadir</div><div style="font-size:16px; font-weight:bold; color:#43a047;">${rekap.hariIni.H || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Izin</div><div style="font-size:16px; font-weight:bold; color:#fbc02d;">${rekap.hariIni.I || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Sakit</div><div style="font-size:16px; font-weight:bold; color:#1e88e5;">${rekap.hariIni.S || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Cabut</div><div style="font-size:16px; font-weight:bold; color:#fb8c00;">${rekap.hariIni.C || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Telat</div><div style="font-size:16px; font-weight:bold; color:#8e24aa;">${rekap.hariIni.T || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Alpa</div><div style="font-size:16px; font-weight:bold; color:#e53935;">${rekap.hariIni.A || 0}</div></div>
        </div>
      </div>

      <!-- Minggu Ini -->
      <div class="form-section" style="padding: 15px; margin-bottom:0;">
        <h4 style="margin-top:0; color:#333; text-align:center; border-bottom:1px solid #ddd; padding-bottom:8px;">Minggu Ini</h4>
        <div style="display:flex; justify-content:space-between; gap:2px; margin-top:10px;">
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Hadir</div><div style="font-size:16px; font-weight:bold; color:#43a047;">${rekap.mingguIni.H || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Izin</div><div style="font-size:16px; font-weight:bold; color:#fbc02d;">${rekap.mingguIni.I || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Sakit</div><div style="font-size:16px; font-weight:bold; color:#1e88e5;">${rekap.mingguIni.S || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Cabut</div><div style="font-size:16px; font-weight:bold; color:#fb8c00;">${rekap.mingguIni.C || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Telat</div><div style="font-size:16px; font-weight:bold; color:#8e24aa;">${rekap.mingguIni.T || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Alpa</div><div style="font-size:16px; font-weight:bold; color:#e53935;">${rekap.mingguIni.A || 0}</div></div>
        </div>
      </div>

      <!-- Bulan Ini -->
      <div class="form-section" style="padding: 15px; margin-bottom:0;">
        <h4 style="margin-top:0; color:#333; text-align:center; border-bottom:1px solid #ddd; padding-bottom:8px;">Bulan Ini</h4>
        <div style="display:flex; justify-content:space-between; gap:2px; margin-top:10px;">
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Hadir</div><div style="font-size:16px; font-weight:bold; color:#43a047;">${rekap.bulanIni.H || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Izin</div><div style="font-size:16px; font-weight:bold; color:#fbc02d;">${rekap.bulanIni.I || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Sakit</div><div style="font-size:16px; font-weight:bold; color:#1e88e5;">${rekap.bulanIni.S || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Cabut</div><div style="font-size:16px; font-weight:bold; color:#fb8c00;">${rekap.bulanIni.C || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Telat</div><div style="font-size:16px; font-weight:bold; color:#8e24aa;">${rekap.bulanIni.T || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Alpa</div><div style="font-size:16px; font-weight:bold; color:#e53935;">${rekap.bulanIni.A || 0}</div></div>
        </div>
      </div>

      <!-- Keseluruhan / Total (Semester Berjalan) -->
      <div class="form-section" style="padding: 15px; margin-bottom:0; border-top:2px dashed #ddd;">
        <h4 style="margin-top:0; color:#333; text-align:center; border-bottom:1px solid #ddd; padding-bottom:8px;">Total Keseluruhan Semester Ini</h4>
        <div style="display:flex; justify-content:space-between; gap:2px; margin-top:10px;">
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Hadir</div><div style="font-size:16px; font-weight:bold; color:#43a047;">${rekap.total.H || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Izin</div><div style="font-size:16px; font-weight:bold; color:#fbc02d;">${rekap.total.I || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Sakit</div><div style="font-size:16px; font-weight:bold; color:#1e88e5;">${rekap.total.S || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Cabut</div><div style="font-size:16px; font-weight:bold; color:#fb8c00;">${rekap.total.C || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Telat</div><div style="font-size:16px; font-weight:bold; color:#8e24aa;">${rekap.total.T || 0}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Alpa</div><div style="font-size:16px; font-weight:bold; color:#e53935;">${rekap.total.A || 0}</div></div>
        </div>
      </div>
    </div>

    <!-- DETAIL PER KELAS HARI INI -->
    <div class="form-section" style="padding:0; overflow:hidden;">
      <h3 style="background:#f5f5f5; padding:15px; margin:0; border-bottom:1px solid #ddd;">Detail Kehadiran Kelas (Hari Ini)</h3>
      <div class="form-grid" style="padding:15px; margin-bottom:0;">
    `;

    const listKelas = Object.keys(rekap.hariIni.perKelas).sort();
    if (listKelas.length === 0) {
      html += `<p style="padding:15px; color:#666; text-align:center; width:100%;">Belum ada data absensi hari ini.</p>`;
    } else {
      listKelas.forEach(kls => {
        const d = rekap.hariIni.perKelas[kls];
        const alpaStyle = d.A > 0 ? 'color:#e53935; font-weight:bold;' : 'color:#666;';

        let listTidakHadirHtml = '';
        if (d.tidakHadir && d.tidakHadir.length > 0) {
          listTidakHadirHtml = `<div style="margin-top:12px; padding-top:10px; border-top:1px dashed #ddd; font-size:12px;">
            <div style="font-weight:bold; color:#555; margin-bottom:6px;">⚠️ Siswa Tidak Hadir (${d.tidakHadir.length}):</div>
            <ul style="margin:0; padding-left:18px; color:#333;">`;
          d.tidakHadir.forEach(s => {
            let badgeBg = '#e53935';
            if (s.statusKode === 'S') badgeBg = '#1e88e5';
            else if (s.statusKode === 'I') badgeBg = '#fbc02d';
            else if (s.statusKode === 'C') badgeBg = '#fb8c00';
            else if (s.statusKode === 'T') badgeBg = '#8e24aa';
            
            listTidakHadirHtml += `<li style="margin-bottom:4px;">
              <b>${s.nama}</b> 
              <span style="background:${badgeBg}; color:white; padding:1px 6px; border-radius:4px; font-size:10px; font-weight:bold;">${s.statusTeks}</span>
            </li>`;
          });
          listTidakHadirHtml += `</ul></div>`;
        } else {
          listTidakHadirHtml = `<div style="margin-top:10px; padding-top:8px; border-top:1px dashed #eee; font-size:11px; color:#43a047; text-align:center;">
            ✅ Semua siswa hadir
          </div>`;
        }

        html += `
        <div class="form-section" style="padding: 15px; margin-bottom:0; border: 1px solid #ddd; border-radius: 8px;">
          <h4 style="margin-top:0; color:#333; text-align:center; border-bottom:1px solid #eee; padding-bottom:10px; font-size:15px;">Kelas ${kls}</h4>
          <div style="display:flex; justify-content:space-between; gap:2px; margin-top:10px;">
            <div style="text-align:center;"><div style="font-size:11px; color:#666;">Hadir</div><div style="font-size:16px; font-weight:bold; color:#43a047;">${d.H > 0 ? d.H : '0'}</div></div>
            <div style="text-align:center;"><div style="font-size:11px; color:#666;">Izin</div><div style="font-size:16px; font-weight:bold; color:#fbc02d;">${d.I > 0 ? d.I : '0'}</div></div>
            <div style="text-align:center;"><div style="font-size:11px; color:#666;">Sakit</div><div style="font-size:16px; font-weight:bold; color:#1e88e5;">${d.S > 0 ? d.S : '0'}</div></div>
            <div style="text-align:center;"><div style="font-size:11px; color:#666;">Cabut</div><div style="font-size:16px; font-weight:bold; color:#fb8c00;">${d.C > 0 ? d.C : '0'}</div></div>
            <div style="text-align:center;"><div style="font-size:11px; color:#666;">Telat</div><div style="font-size:16px; font-weight:bold; color:#8e24aa;">${d.T > 0 ? d.T : '0'}</div></div>
            <div style="text-align:center;"><div style="font-size:11px; color:#666;">Alpa</div><div style="font-size:16px; ${alpaStyle}">${d.A > 0 ? d.A : '0'}</div></div>
          </div>
          ${listTidakHadirHtml}
        </div>
        `;
      });
    }

    const daftarKelasReguler = (meta && meta.daftarKelas && meta.daftarKelas.length > 0) ? meta.daftarKelas : listKelas;

    html += `
      </div>
    </div>
    <p style="text-align:right; font-size:12px; color:#999; margin-top:10px;">
      *Sistem menerapkan prioritas absensi harian jika terjadi perbedaan data antar jam: Alpa > Cabut > Sakit > Izin > Terlambat > Hadir.
    </p>
    
    <!-- WIDGET TOP 10 SISWA TIDAK HADIR TERBANYAK -->
    <div class="form-section" style="padding:0; overflow:hidden; margin-top:20px;">
      <div style="background:#f5f5f5; padding:15px; border-bottom:1px solid #ddd; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <h3 style="margin:0; font-size:16px; color:#333;">🏆 Top 10 Siswa Ketidakhadiran Terbanyak</h3>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <select id="top10KelasFilter" onchange="loadTop10SiswaTidakHadir()" style="padding:6px 10px; border-radius:6px; border:1px solid #ccc; font-size:12px;">
            <option value="ALL">Semua Kelas</option>
            ${daftarKelasReguler.map(k => `<option value="${k}">${k}</option>`).join('')}
          </select>
          <select id="top10BulanFilter" onchange="loadTop10SiswaTidakHadir()" style="padding:6px 10px; border-radius:6px; border:1px solid #ccc; font-size:12px;">
            <option value="ALL">Semua Bulan</option>
            <option value="1">Januari</option>
            <option value="2">Februari</option>
            <option value="3">Maret</option>
            <option value="4">April</option>
            <option value="5">Mei</option>
            <option value="6">Juni</option>
            <option value="7">Juli</option>
            <option value="8">Agustus</option>
            <option value="9">September</option>
            <option value="10">Oktober</option>
            <option value="11">November</option>
            <option value="12">Desember</option>
          </select>
        </div>
      </div>
      <div id="containerTop10Siswa" style="padding:15px; overflow-x:auto;">
        <p style="text-align:center; color:#666; font-size:13px;">⏳ Memuat data Top 10...</p>
      </div>
    </div>
  </div>
  `;

  document.getElementById('pimpinan_kehadiran').innerHTML = html;
  
  // Langsung proses top 10 berdasarkan rawData yang ada di cache
  loadTop10SiswaTidakHadir();
}

function loadTop10SiswaTidakHadir() {
  const container = document.getElementById('containerTop10Siswa');
  if (!container) return;
  
  const kelas = document.getElementById('top10KelasFilter')?.value || 'ALL';
  const bulan = document.getElementById('top10BulanFilter')?.value || 'ALL';
  
  const cachedData = AppCache.get('dashboardKehadiran');
  if (!cachedData || !cachedData.rawDataTop10) {
    container.innerHTML = '<p style="text-align:center; color:#666; font-size:13px; padding:15px;">Belum ada data dasar. Silakan refresh dasbor.</p>';
    return;
  }
  
  const rawData = cachedData.rawDataTop10; // Ini array object: tanggal, status, kelas, nis, nama (yg status !== H)
  
  // Filter berdasarkan kelas & bulan
  const filteredData = rawData.filter(row => {
    if (kelas !== 'ALL' && row.kelas !== kelas) return false;
    
    if (bulan !== 'ALL') {
      // row.tanggal format YYYY-MM-DD
      const rowBulan = parseInt(row.tanggal.split('-')[1], 10);
      if (rowBulan !== parseInt(bulan, 10)) return false;
    }
    
    return true;
  });
  
  // Agregasi jumlah Alpha, Sakit, Izin, Cabut per NIS
  const agg = {};
  filteredData.forEach(row => {
    if (!agg[row.nis]) {
      agg[row.nis] = { nama: row.nama, kelas: row.kelas, A:0, S:0, I:0, C:0, T:0 };
    }
    if (row.status === 'A') agg[row.nis].A++;
    else if (row.status === 'S') agg[row.nis].S++;
    else if (row.status === 'I') agg[row.nis].I++;
    else if (row.status === 'C') agg[row.nis].C++;
    else if (row.status === 'T') agg[row.nis].T++;
  });
  
  // Hitung total poin / pelanggaran absensi untuk disortir
  // Kita urutkan berdasarkan Total A + C + S + I
  const finalArray = Object.keys(agg).map(nis => {
    const d = agg[nis];
    const totalTidakHadir = d.A + d.C + d.S + d.I + d.T;
    return {
      nis: nis,
      nama: d.nama,
      kelas: d.kelas,
      A: d.A, S: d.S, I: d.I, C: d.C, T: d.T,
      total: totalTidakHadir
    };
  });
  
  // Sort by total descending
  finalArray.sort((a, b) => b.total - a.total);
  
  // Ambil Top 10
  const top10 = finalArray.slice(0, 10);
  
  if (top10.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:#666; font-size:13px; padding:15px;">Tidak ada data ketidakhadiran pada filter yang dipilih.</p>';
    return;
  }
  
  // Render Tabel
  let tableHtml = `
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead>
        <tr style="background:#f8f9fa; border-bottom:2px solid #dee2e6; text-align:left;">
          <th style="padding:8px 10px; width:60px; text-align:center;">Rank</th>
          <th style="padding:8px 10px;">Nama Siswa</th>
          <th style="padding:8px 10px; width:80px;">Kelas</th>
          <th style="padding:8px 10px; width:60px; text-align:center; color:#e53935;">A</th>
          <th style="padding:8px 10px; width:60px; text-align:center; color:#fb8c00;">C</th>
          <th style="padding:8px 10px; width:60px; text-align:center; color:#1e88e5;">S</th>
          <th style="padding:8px 10px; width:60px; text-align:center; color:#fbc02d;">I</th>
          <th style="padding:8px 10px; width:60px; text-align:center; color:#8e24aa;">T</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  top10.forEach((item, index) => {
    tableHtml += `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:8px 10px; text-align:center;"><b>#${index + 1}</b></td>
        <td style="padding:8px 10px;">${item.nama}</td>
        <td style="padding:8px 10px;">${item.kelas}</td>
        <td style="padding:8px 10px; text-align:center; font-weight:bold; color:${item.A>0?'#e53935':'#ccc'}">${item.A}</td>
        <td style="padding:8px 10px; text-align:center; font-weight:bold; color:${item.C>0?'#fb8c00':'#ccc'}">${item.C}</td>
        <td style="padding:8px 10px; text-align:center; font-weight:bold; color:${item.S>0?'#1e88e5':'#ccc'}">${item.S}</td>
        <td style="padding:8px 10px; text-align:center; font-weight:bold; color:${item.I>0?'#fbc02d':'#ccc'}">${item.I}</td>
        <td style="padding:8px 10px; text-align:center; font-weight:bold; color:${item.T>0?'#8e24aa':'#ccc'}">${item.T}</td>
      </tr>
    `;
  });
  
  tableHtml += `
      </tbody>
    </table>
  `;
  
  container.innerHTML = tableHtml;
}

// ============================================================
// ============ LAIN-LAIN (BERANDA, AKTIVITAS, SHALAT, DSB) ===
// ============================================================
async function renderPimpinanBeranda(forceRefresh = false) {
  const roleLower = App.user.role ? App.user.role.toLowerCase() : '';
  if (roleLower !== 'pimpinan') return;

  if (forceRefresh !== true) {
    const cached = AppCache.get('dashboardPimpinanBeranda');
    if (cached) {
      tampilkanPimpinanBeranda(cached);
      return;
    }
  }

  showLoading(true, 'Memuat jadwal guru hari ini...');

  try {
    const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const todayStr = hariArr[new Date().getDay()];

    // 1. Ambil Jadwal Hari Ini
    const { data: jadwalData, error: errJadwal } = await supaClient
      .from('jadwal')
      .select('username_guru, jam, kelas, mapel')
      .ilike('hari', todayStr)
      .order('jam', { ascending: true });

    if (errJadwal) throw errJadwal;

    // 2. Ambil Semua Data Guru untuk mapping nama
    const { data: guruData, error: errGuru } = await supaClient
      .from('data_guru')
      .select('username, nama');

    if (errGuru) throw errGuru;

    const guruMap = {};
    if (guruData) {
      guruData.forEach(g => {
        guruMap[g.username] = g.nama;
      });
    }

    // 3. Kelompokkan jadwal yang jam nya berurutan (misal 1,2 jadi 1-2) per guru, kelas, mapel
    let groupedJadwal = [];
    if (jadwalData && jadwalData.length > 0) {
      // Sort by username_guru then jam
      jadwalData.sort((a, b) => {
        if (a.username_guru !== b.username_guru) return a.username_guru.localeCompare(b.username_guru);
        return parseInt(a.jam) - parseInt(b.jam);
      });

      let currentGroup = null;
      for (let i = 0; i < jadwalData.length; i++) {
        let row = jadwalData[i];
        if (!currentGroup) {
          currentGroup = { ...row, startJam: parseInt(row.jam), endJam: parseInt(row.jam) };
        } else {
          if (currentGroup.username_guru === row.username_guru && 
              currentGroup.kelas === row.kelas && 
              currentGroup.mapel === row.mapel && 
              parseInt(row.jam) === currentGroup.endJam + 1) {
            currentGroup.endJam = parseInt(row.jam);
          } else {
            let jamStr = currentGroup.startJam === currentGroup.endJam ? `${currentGroup.startJam}` : `${currentGroup.startJam}-${currentGroup.endJam}`;
            groupedJadwal.push({ nama_guru: guruMap[currentGroup.username_guru] || currentGroup.username_guru, jam: jamStr, kelas: currentGroup.kelas, mapel: currentGroup.mapel });
            currentGroup = { ...row, startJam: parseInt(row.jam), endJam: parseInt(row.jam) };
          }
        }
      }
      if (currentGroup) {
        let jamStr = currentGroup.startJam === currentGroup.endJam ? `${currentGroup.startJam}` : `${currentGroup.startJam}-${currentGroup.endJam}`;
        groupedJadwal.push({ nama_guru: guruMap[currentGroup.username_guru] || currentGroup.username_guru, jam: jamStr, kelas: currentGroup.kelas, mapel: currentGroup.mapel });
      }
    }

    const res = {
      success: true,
      hari: todayStr,
      jadwal: groupedJadwal
    };

    AppCache.set('dashboardPimpinanBeranda', res, 10);
    showLoading(false);
    tampilkanPimpinanBeranda(res);
  } catch (err) {
    showLoading(false);
    document.getElementById('pimpinan_beranda').innerHTML = '<div class="form-section"><p>Gagal memuat data: ' + err.message + '</p></div>';
  }
}

function tampilkanPimpinanBeranda(res) {
  let tableHtml = '';
  if (res.jadwal && res.jadwal.length > 0) {
    tableHtml = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th style="width: 50px; text-align: center;">No</th>
              <th>Nama Guru</th>
              <th>Kelas</th>
              <th>Mata Pelajaran</th>
              <th>Jam</th>
            </tr>
          </thead>
          <tbody>
    `;

    res.jadwal.forEach((j, idx) => {
      tableHtml += `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td style="font-weight: 500;">${j.nama_guru}</td>
          <td>${j.kelas}</td>
          <td>${j.mapel}</td>
          <td><span class="badge" style="background:#e3f2fd; color:#1976d2; padding:5px 10px;">${j.jam}</span></td>
        </tr>
      `;
    });

    tableHtml += `
          </tbody>
        </table>
      </div>
    `;
  } else {
    tableHtml = `<div style="text-align:center; padding:30px; background:#f5f5f5; border-radius:8px; margin-top:20px;">
      <p style="color:#666; font-size:1.1rem;">🏖️ Tidak ada jadwal mengajar pada hari ${res.hari}.</p>
    </div>`;
  }

  const html = `
    <div class="form-section">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:10px;">
        <h2 style="color:#2e7d32; margin:0;">🏠 BERANDA PIMPINAN</h2>
        <button class="btn btn-warning" onclick="renderPimpinanBeranda(true)" style="padding: 8px 15px; font-size: 13px; font-weight: bold; border-radius: 8px;">🔄 SEGARKAN DATA</button>
      </div>
      <h3 style="margin-bottom:20px; font-size:1.8rem;">Selamat datang, ${App.user.profil.nama || '-'}</h3>

      <div style="background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-top: 30px;">
        <h4 style="color:#1565c0; margin-bottom:20px; display:flex; align-items:center; gap:10px;">
          👨‍🏫 GURU MENGAJAR HARI INI <span style="font-size:0.9rem; font-weight:normal; background:#e8f5e9; color:#2e7d32; padding:4px 10px; border-radius:20px;">Hari ${res.hari}</span>
        </h4>
        ${tableHtml}
      </div>
      
      <!-- TABEL DISIPLIN GURU -->
      <div id="pimpinan_disiplin_container" style="background: #fff; padding: 20px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-top: 30px;"></div>
      
    </div>
  `;

  document.getElementById('pimpinan_beranda').innerHTML = html;
  
  // Panggil fungsi Disiplin dari DashboardPimpinan.js
  if (typeof loadPimpinanDisiplin === 'function') {
    loadPimpinanDisiplin();
  }
}

async function renderPimpinanAktivitas(forceRefresh = false) {
  if (forceRefresh !== true) {
    const cached = AppCache.get('cache_pimpinan_aktivitas');
    if (cached) {
      tampilkanPimpinanAktivitas(cached);
      return;
    }
  }

  showLoading(true, 'Memuat Data Aktivitas Guru (Jurnal)...');

  try {
    const { data: jurnalList, error } = await supaClient
      .from('jurnal_guru')
      .select('nama_guru, tanggal');

    if (error) throw error;

    const now = new Date();
    
    // Konversi ke UTC+7 (WIB) untuk mendapatkan tanggal lokal yang akurat
    const tzOffset = 7 * 60; // 7 jam dalam menit
    const localTime = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000);
    
    const today = localTime.toISOString().split('T')[0];
    const currentYear = localTime.getFullYear();
    const currentMonth = localTime.getMonth() + 1; // 1-12
    const currentMonthStr = String(currentMonth).padStart(2, '0');

    // Batas minggu ini (Senin - Minggu)
    const dayOfWeek = localTime.getDay() || 7; 
    const monday = new Date(localTime);
    monday.setDate(localTime.getDate() - dayOfWeek + 1);
    const startOfWeek = monday.toISOString().split('T')[0];
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const endOfWeek = sunday.toISOString().split('T')[0];

    const summaryMap = {};

    jurnalList.forEach(j => {
      const guru = j.nama_guru || 'Unknown';
      if (!summaryMap[guru]) {
        summaryMap[guru] = { nama: guru, hariIni: 0, mingguIni: 0, bulanIni: 0, total: 0 };
      }
      
      summaryMap[guru].total++;
      
      if (j.tanggal === today) {
        summaryMap[guru].hariIni++;
      }
      
      if (j.tanggal >= startOfWeek && j.tanggal <= endOfWeek) {
        summaryMap[guru].mingguIni++;
      }
      
      if (j.tanggal && j.tanggal.startsWith(`${currentYear}-${currentMonthStr}`)) {
        summaryMap[guru].bulanIni++;
      }
    });

    const summaryArr = Object.values(summaryMap).sort((a, b) => b.total - a.total);

    AppCache.set('cache_pimpinan_aktivitas', summaryArr, 10);
    showLoading(false);
    tampilkanPimpinanAktivitas(summaryArr);

  } catch (err) {
    showLoading(false);
    showError('Gagal memuat aktivitas guru: ' + err.message);
  }
}

function tampilkanPimpinanAktivitas(dataGuru) {
  let html = `
  <div class="form-section" style="background: #e65100; color: white; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
    <div>
      <h3 style="color: white; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px; margin-top:0;">👨‍🏫 AKTIVITAS GURU (JURNAL)</h3>
      <p style="margin-bottom:0; font-size:14px; opacity: 0.9;">Pantau keaktifan guru dalam mengisi Jurnal Mengajar.</p>
    </div>
    <button class="btn btn-warning" onclick="renderPimpinanAktivitas(true)" style="padding: 8px 15px; font-size: 13px; font-weight: bold; border-radius: 8px;">🔄 SEGARKAN DATA</button>
  </div>
  
  <!-- AKTIVITAS PENGISIAN JURNAL -->
  <div class="form-section" style="padding:0; overflow:hidden;">
    <h3 style="background:#f5f5f5; padding:15px; margin:0; border-bottom:1px solid #ddd;">Aktivitas Pengisian Jurnal Mengajar</h3>
    <div class="form-grid" style="padding:15px; margin-bottom:0;">
  `;

  if (dataGuru.length === 0) {
    html += `<p style="padding:15px; color:#666; text-align:center; width:100%;">Belum ada data aktivitas guru.</p>`;
  } else {
    dataGuru.forEach(g => {
      html += `
      <div class="form-section" style="padding: 15px; margin-bottom:0; border: 1px solid #ddd; border-top: 4px solid #fb8c00; border-radius: 8px;">
        <h4 style="margin-top:0; color:#333; text-align:center; border-bottom:1px solid #eee; padding-bottom:10px; font-size:14px; min-height: 35px;">${g.nama}</h4>
        <div style="display:flex; justify-content:space-between; margin-top:10px;">
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Hari Ini</div><div style="font-size:16px; font-weight:bold; color:#fb8c00;">${g.hariIni}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Minggu</div><div style="font-size:16px; font-weight:bold; color:#f57c00;">${g.mingguIni}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Bulan</div><div style="font-size:16px; font-weight:bold; color:#ef6c00;">${g.bulanIni}</div></div>
          <div style="text-align:center;"><div style="font-size:11px; color:#666;">Total</div><div style="font-size:16px; font-weight:bold; color:#e65100;">${g.total}</div></div>
        </div>
      </div>
      `;
    });
  }

  html += `
    </div>
  </div>
  `;

  document.getElementById('pimpinan_aktivitas').innerHTML = html;
}

async function renderPimpinanShalat(forceRefresh = false) {
  if (forceRefresh !== true) {
    const cached = AppCache.get('cache_pimpinan_shalat');
    if (cached) {
      tampilkanPimpinanShalat(cached);
      return;
    }
  }

  showLoading(true, 'Memuat Data Rekap Shalat...');

  try {
    const { data: shalatList, error } = await supaClient
      .from('absensi_shalat')
      .select('tanggal, status');

    if (error) throw error;

    const now = new Date();
    const tzOffset = 7 * 60;
    const localTime = new Date(now.getTime() + (tzOffset + now.getTimezoneOffset()) * 60000);
    
    const today = localTime.toISOString().split('T')[0];
    const currentYear = localTime.getFullYear();
    const currentMonth = localTime.getMonth() + 1;
    const currentMonthStr = String(currentMonth).padStart(2, '0');

    const dayOfWeek = localTime.getDay() || 7; 
    const monday = new Date(localTime);
    monday.setDate(localTime.getDate() - dayOfWeek + 1);
    const startOfWeek = monday.toISOString().split('T')[0];
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const endOfWeek = sunday.toISOString().split('T')[0];

    const rekap = {
      hariIni: { Y: 0, T: 0 },
      mingguIni: { Y: 0, T: 0 },
      bulanIni: { Y: 0, T: 0 },
      total: { Y: 0, T: 0 }
    };

    shalatList.forEach(s => {
      if (s.status === 'Y' || s.status === 'T') {
        rekap.total[s.status]++;
        
        if (s.tanggal === today) {
          rekap.hariIni[s.status]++;
        }
        if (s.tanggal >= startOfWeek && s.tanggal <= endOfWeek) {
          rekap.mingguIni[s.status]++;
        }
        if (s.tanggal && s.tanggal.startsWith(`${currentYear}-${currentMonthStr}`)) {
          rekap.bulanIni[s.status]++;
        }
      }
    });

    AppCache.set('cache_pimpinan_shalat', rekap, 10);
    showLoading(false);
    tampilkanPimpinanShalat(rekap);

  } catch (err) {
    showLoading(false);
    showError('Gagal memuat rekap shalat: ' + err.message);
  }
}

function tampilkanPimpinanShalat(rekap) {
  let html = `
  <div class="form-section" style="background: #1b5e20; color: white; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
    <div>
      <h3 style="color: white; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px; margin-top:0;">🕌 REKAP SHALAT BERJAMAAH</h3>
      <p style="margin-bottom:0; font-size:14px; opacity: 0.9;">Pantau keaktifan siswa dalam shalat berjamaah di sekolah.</p>
    </div>
    <button class="btn btn-warning" onclick="renderPimpinanShalat(true)" style="padding: 8px 15px; font-size: 13px; font-weight: bold; border-radius: 8px;">🔄 SEGARKAN DATA</button>
  </div>
  
  <div class="form-grid" style="margin-bottom: 20px;">
    <!-- Hari Ini -->
    <div class="form-section" style="padding: 15px; margin-bottom:0;">
      <h4 style="margin-top:0; color:#333; text-align:center; border-bottom:1px solid #ddd; padding-bottom:8px;">Hari Ini</h4>
      <div style="display:flex; justify-content:space-between; margin-top:10px;">
        <div style="text-align:center; flex:1;">
          <span style="font-size:11px; color:#666; display:block;">Jamaah</span>
          <span style="font-size:18px; font-weight:bold; color:#43a047;">${rekap.hariIni.Y}</span>
        </div>
        <div style="text-align:center; flex:1; border-left:1px solid #eee;">
          <span style="font-size:11px; color:#666; display:block;">Tidak</span>
          <span style="font-size:18px; font-weight:bold; color:#e53935;">${rekap.hariIni.T}</span>
        </div>
      </div>
    </div>

    <!-- Minggu Ini -->
    <div class="form-section" style="padding: 15px; margin-bottom:0;">
      <h4 style="margin-top:0; color:#333; text-align:center; border-bottom:1px solid #ddd; padding-bottom:8px;">Minggu Ini</h4>
      <div style="display:flex; justify-content:space-between; margin-top:10px;">
        <div style="text-align:center; flex:1;">
          <span style="font-size:11px; color:#666; display:block;">Jamaah</span>
          <span style="font-size:18px; font-weight:bold; color:#43a047;">${rekap.mingguIni.Y}</span>
        </div>
        <div style="text-align:center; flex:1; border-left:1px solid #eee;">
          <span style="font-size:11px; color:#666; display:block;">Tidak</span>
          <span style="font-size:18px; font-weight:bold; color:#e53935;">${rekap.mingguIni.T}</span>
        </div>
      </div>
    </div>

    <!-- Bulan Ini -->
    <div class="form-section" style="padding: 15px; margin-bottom:0;">
      <h4 style="margin-top:0; color:#333; text-align:center; border-bottom:1px solid #ddd; padding-bottom:8px;">Bulan Ini</h4>
      <div style="display:flex; justify-content:space-between; margin-top:10px;">
        <div style="text-align:center; flex:1;">
          <span style="font-size:11px; color:#666; display:block;">Jamaah</span>
          <span style="font-size:18px; font-weight:bold; color:#43a047;">${rekap.bulanIni.Y}</span>
        </div>
        <div style="text-align:center; flex:1; border-left:1px solid #eee;">
          <span style="font-size:11px; color:#666; display:block;">Tidak</span>
          <span style="font-size:18px; font-weight:bold; color:#e53935;">${rekap.bulanIni.T}</span>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Keseluruhan -->
  <div class="form-section" style="text-align:center;">
    <h4 style="margin-top:0; color:#333; border-bottom:1px solid #ddd; padding-bottom:8px;">Total Keseluruhan (Tahun Ajaran Ini)</h4>
    <div style="display:flex; justify-content:center; flex-wrap:wrap; gap:15px; margin-top:15px;">
      <div style="flex: 1; min-width: 90px;">
        <span style="font-size:13px; color:#666; display:block;">Jamaah (Y)</span>
        <span style="font-size:24px; font-weight:bold; color:#43a047;">${rekap.total.Y}</span>
      </div>
      <div style="flex: 1; min-width: 90px;">
        <span style="font-size:13px; color:#666; display:block;">Tidak (T)</span>
        <span style="font-size:24px; font-weight:bold; color:#e53935;">${rekap.total.T}</span>
      </div>
    </div>
  </div>
  `;

  document.getElementById('pimpinan_shalat').innerHTML = html;
}

async function renderPimpinanPelanggaran(forceRefresh = false) {
  if (forceRefresh !== true) {
    const cached = AppCache.get('cache_pimpinan_pelanggaran');
    if (cached) {
      tampilkanPimpinanPelanggaran(cached);
      return;
    }
  }

  showLoading(true, 'Memuat Data Pelanggaran...');

  try {
    const { data, error } = await supaClient
      .from('catatan_sikap')
      .select('nis, nama, kelas, poin')
      .lt('poin', 0); // Ambil yang negatif (pelanggaran)

    if (error) throw error;

    const summaryMap = {};
    (data || []).forEach(row => {
      if (!summaryMap[row.nis]) {
        summaryMap[row.nis] = { nama: row.nama, kelas: row.kelas, totalPoin: 0 };
      }
      // Absolutkan poin karena UI ingin menampilkan nilai positif atau akumulasi
      summaryMap[row.nis].totalPoin += Math.abs(parseInt(row.poin) || 0);
    });

    const top10 = Object.values(summaryMap)
      .sort((a, b) => b.totalPoin - a.totalPoin)
      .slice(0, 10);

    AppCache.set('cache_pimpinan_pelanggaran', top10, 10);
    showLoading(false);
    tampilkanPimpinanPelanggaran(top10);
  } catch (err) {
    showLoading(false);
    showError('Gagal memuat data pelanggaran: ' + err.message);
  }
}

function tampilkanPimpinanPelanggaran(top10) {
  let html = `
  <div class="form-section" style="background: #b71c1c; color: white; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
    <div>
      <h3 style="color: white; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px; margin-top:0;">⚠️ TOP 10 PELANGGARAN SISWA</h3>
      <p style="margin-bottom:0; font-size:14px; opacity: 0.9;">Pantau 10 siswa dengan akumulasi poin pelanggaran tertinggi (Keseluruhan).</p>
    </div>
    <button class="btn btn-warning" onclick="renderPimpinanPelanggaran(true)" style="padding: 8px 15px; font-size: 13px; font-weight: bold; border-radius: 8px;">🔄 SEGARKAN DATA</button>
  </div>
  
  <div class="form-section" style="padding:0; overflow:hidden;">
    <div class="form-grid" style="padding:15px; margin-bottom:0;">
  `;

  if (top10.length === 0) {
    html += `<p style="padding:15px; color:#666; text-align:center; width:100%;">Belum ada data pelanggaran siswa.</p>`;
  } else {
    top10.forEach((s, idx) => {
      html += `
      <div class="form-section" style="padding: 15px; margin-bottom:0; border: 1px solid #ddd; border-left: 4px solid #d32f2f; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 15px;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: #ffebee; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #d32f2f; font-size: 16px; flex-shrink: 0;">
            #${idx + 1}
          </div>
          <div>
            <h4 style="margin:0 0 3px 0; color:#333; font-size:14px; line-height:1.2;">${s.nama}</h4>
            <span style="font-size:11px; color:#666; background:#f5f5f5; padding:2px 6px; border-radius:10px;">Kelas: ${s.kelas}</span>
          </div>
        </div>
        <div style="text-align:right; background:#ffebee; padding:6px 12px; border-radius:8px; min-width: 70px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
          <div style="font-size:10px; color:#c62828; text-transform:uppercase; font-weight:bold;">Total Poin</div>
          <div style="font-size:18px; font-weight:bold; color:#d32f2f;">${s.totalPoin}</div>
        </div>
      </div>
      `;
    });
  }

  html += `
    </div>
  </div>
  `;

  document.getElementById('pimpinan_pelanggaran').innerHTML = html;
}

async function renderPimpinanSikap(forceRefresh = false) {
  if (forceRefresh !== true) {
    const cached = AppCache.get('cache_pimpinan_sikap');
    if (cached) {
      tampilkanPimpinanSikap(cached);
      return;
    }
  }

  showLoading(true, 'Memuat Data Catatan Sikap...');

  try {
    const { data, error } = await supaClient
      .from('catatan_sikap')
      .select('nis, nama, kelas, poin')
      .gt('poin', 0); // Ambil yang positif

    if (error) throw error;

    const summaryMap = {};
    (data || []).forEach(row => {
      const poin = parseInt(row.poin) || 0;
      if (!summaryMap[row.nis]) {
        summaryMap[row.nis] = { nama: row.nama, kelas: row.kelas, totalPoin: 0 };
      }
      summaryMap[row.nis].totalPoin += poin;
    });

    const top10 = Object.values(summaryMap)
      .sort((a, b) => b.totalPoin - a.totalPoin)
      .slice(0, 10);

    const r = { top10: top10, rekap: {} };
    AppCache.set('cache_pimpinan_sikap', r, 10);
    showLoading(false);
    tampilkanPimpinanSikap(r);
  } catch (err) {
    showLoading(false);
    showError('Gagal memuat catatan sikap: ' + err.message);
  }
}

function tampilkanPimpinanSikap(r) {
  const rekap = r.rekap;
  const top10 = r.top10;

  let html = `
  <div class="form-section" style="background: #6a1b9a; color: white; border-radius: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
    <div>
      <h3 style="color: white; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px; margin-top:0;">📝 CATATAN SIKAP / PERKEMBANGAN</h3>
      <p style="margin-bottom:0; font-size:14px; opacity: 0.9;">Pantau rekapitulasi catatan positif dan negatif siswa (Keseluruhan).</p>
    </div>
    <button class="btn btn-warning" onclick="renderPimpinanSikap(true)" style="padding: 8px 15px; font-size: 13px; font-weight: bold; border-radius: 8px;">🔄 SEGARKAN DATA</button>
  </div>

  <div class="form-section" style="padding:0; overflow:hidden;">
    <h4 style="padding:15px 15px 0 15px; margin:0; color:#333; border-bottom: 1px solid #ddd; padding-bottom: 10px;">Top 10 Siswa Teladan (Poin Positif Tertinggi)</h4>
    <div class="form-grid" style="padding:15px; margin-bottom:0;">
  `;

  if (top10.length === 0) {
    html += `<p style="padding:15px; color:#666; text-align:center; width:100%;">Belum ada catatan sikap siswa.</p>`;
  } else {
    top10.forEach((s, idx) => {
      const colorClass = s.totalPoin > 0 ? '#43a047' : '#d32f2f';
      const bgClass = s.totalPoin > 0 ? '#e8f5e9' : '#ffebee';
      html += `
      <div class="form-section" style="padding: 15px; margin-bottom:0; border: 1px solid #ddd; border-left: 4px solid #8e24aa; border-radius: 8px; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 15px;">
          <div style="width: 36px; height: 36px; border-radius: 50%; background: #f3e5f5; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #8e24aa; font-size: 16px; flex-shrink: 0;">
            #${idx + 1}
          </div>
          <div>
            <h4 style="margin:0 0 3px 0; color:#333; font-size:14px; line-height:1.2;">${s.nama}</h4>
            <span style="font-size:11px; color:#666; background:#f5f5f5; padding:2px 6px; border-radius:10px;">Kelas: ${s.kelas}</span>
          </div>
        </div>
        <div style="text-align:right; background:${bgClass}; padding:6px 12px; border-radius:8px; min-width: 70px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
          <div style="font-size:10px; color:${colorClass}; text-transform:uppercase; font-weight:bold;">Total Poin</div>
          <div style="font-size:18px; font-weight:bold; color:${colorClass};">${s.totalPoin > 0 ? '+' + s.totalPoin : s.totalPoin}</div>
        </div>
      </div>
      `;
    });
  }

  html += `
    </div>
  </div>
  `;

  document.getElementById('pimpinan_sikap').innerHTML = html;
}

// ============================================================
// ============ FUNGSI BOBOT SISWA (PIMPINAN) =================
// ============================================================
async function renderPimpinanBobot(forceRefresh = false) {
  const kelasSelect = document.getElementById('filterKelasBobotPimpinan');
  const bulanSelect = document.getElementById('filterBulanBobotPimpinan');
  
  // Ambil kelas dari config jika tidak ada yg terpilih
  const defaultKelas = (App.config && App.config.kelasReguler && App.config.kelasReguler.length > 0) ? App.config.kelasReguler[0] : 'E1';
  const kelas = kelasSelect ? kelasSelect.value : defaultKelas;
  const bulan = bulanSelect ? bulanSelect.value : 'ALL';

  const cacheKey = `cache_pimpinan_bobot_${kelas}_${bulan}`;
  
  if (forceRefresh !== true) {
    const cached = AppCache.get(cacheKey);
    if (cached) {
      tampilkanPimpinanBobot(cached, kelas, bulan);
      return;
    }
  }

  showLoading(true, 'Memuat Data Bobot Siswa...');

  try {
    const { data, error } = await supaClient
      .from('catatan_sikap')
      .select('nis, nama, kelas, poin, tanggal')
      .eq('kelas', kelas);

    if (error) throw error;
    
    // Filter berdasarkan bulan
    const filteredData = (data || []).filter(item => {
      if (!item.tanggal) return false;
      const [y, m, d] = item.tanggal.split('-');
      if (bulan !== 'ALL' && parseInt(m) !== parseInt(bulan)) return false;
      return true;
    });

    const summaryMap = {};
    filteredData.forEach(row => {
      if (!summaryMap[row.nis]) {
        summaryMap[row.nis] = { nama: row.nama, kelas: row.kelas, positif: 0, pelanggaran: 0, totalBobot: 0 };
      }
      const poin = parseInt(row.poin) || 0;
      if (poin > 0) {
        summaryMap[row.nis].positif += poin;
      } else if (poin < 0) {
        summaryMap[row.nis].pelanggaran += Math.abs(poin);
      }
    });

    Object.values(summaryMap).forEach(s => {
      s.totalBobot = s.positif - s.pelanggaran;
    });

    const resultList = Object.values(summaryMap)
      .sort((a, b) => b.totalBobot - a.totalBobot);

    AppCache.set(cacheKey, resultList, 10);
    showLoading(false);
    tampilkanPimpinanBobot(resultList, kelas, bulan);

  } catch (err) {
    showLoading(false);
    showError('Gagal memuat data bobot: ' + err.message);
  }
}

function tampilkanPimpinanBobot(dataBobot, currentKelas, currentBulan) {
  let kelasOptions = '';
  App.config.kelasReguler.forEach(k => {
    kelasOptions += `<option style="color:#333; background:#fff;" value="${k}" ${k === currentKelas ? 'selected' : ''}>${k}</option>`;
  });

  const bulanNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  let bulanOptions = `<option style="color:#333; background:#fff;" value="ALL" ${currentBulan === 'ALL' ? 'selected' : ''}>Semua Bulan</option>`;
  bulanNames.forEach((b, idx) => {
    const val = idx + 1;
    bulanOptions += `<option style="color:#333; background:#fff;" value="${val}" ${val.toString() === currentBulan ? 'selected' : ''}>${b}</option>`;
  });

  let html = `
  <div class="form-section" style="background: linear-gradient(135deg, #00838f 0%, #006978 100%); color: white; border-radius: 14px; margin-bottom: 20px; padding: 20px;">
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 12px; margin-bottom: 15px;">
      <div>
        <h3 style="color: white; margin:0 0 4px 0; font-size:18px;">⚖️ BOBOT SISWA</h3>
        <p style="margin:0; font-size:12px; opacity: 0.8;">Total Bobot = Poin Positif - Poin Pelanggaran</p>
      </div>
    </div>
    <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end;">
      <div style="flex: 1; min-width: 140px;">
        <label style="font-size: 11px; font-weight: bold; color: rgba(255,255,255,0.8); display:block; margin-bottom:5px; letter-spacing:0.5px;">🏫 KELAS</label>
        <select id="filterKelasBobotPimpinan" onchange="renderPimpinanBobot()" style="width:100%; padding:9px 12px; border-radius:8px; border:2px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.15); color:white; font-size:14px; font-weight:bold; cursor:pointer; outline:none; backdrop-filter:blur(4px);">${kelasOptions}</select>
      </div>
      <div style="flex: 2; min-width: 160px;">
        <label style="font-size: 11px; font-weight: bold; color: rgba(255,255,255,0.8); display:block; margin-bottom:5px; letter-spacing:0.5px;">📅 BULAN</label>
        <select id="filterBulanBobotPimpinan" onchange="renderPimpinanBobot()" style="width:100%; padding:9px 12px; border-radius:8px; border:2px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.15); color:white; font-size:14px; font-weight:bold; cursor:pointer; outline:none; backdrop-filter:blur(4px);">${bulanOptions}</select>
      </div>
      <div style="flex: 0 0 auto;">
        <button onclick="renderPimpinanBobot(true)" style="padding:10px 16px; background:rgba(255,255,255,0.2); border:2px solid rgba(255,255,255,0.4); border-radius:8px; color:white; font-size:13px; font-weight:bold; cursor:pointer; white-space:nowrap; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.35)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">🔄 Segarkan</button>
      </div>
    </div>
  </div>

  <div class="form-section" style="padding:0; overflow:hidden;">
    <div class="form-grid" style="padding:15px; margin-bottom:0;">
  `;

  if (dataBobot.length === 0) {
    html += `<p style="padding:15px; color:#666; text-align:center; width:100%;">Belum ada data bobot untuk filter yang dipilih.</p>`;
  } else {
    dataBobot.forEach((s, idx) => {
      let bgClass = '#f5f5f5';
      let colorClass = '#333';
      
      if (s.totalBobot > 0) {
        bgClass = '#e8f5e9';
        colorClass = '#2e7d32';
      } else if (s.totalBobot < 0) {
        bgClass = '#ffebee';
        colorClass = '#c62828';
      }
      
      html += `
      <div class="form-section" style="padding: 15px; margin-bottom:0; border: 1px solid #ddd; border-left: 4px solid ${colorClass}; border-radius: 8px;">
        
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
          <div>
            <h4 style="margin:0 0 3px 0; color:#333; font-size:15px;">${s.nama}</h4>
            <span style="font-size:11px; color:#666; background:#f5f5f5; padding:2px 6px; border-radius:10px;">Kelas: ${s.kelas}</span>
          </div>
          <div style="text-align:right; background:${bgClass}; padding:6px 12px; border-radius:8px; min-width: 70px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div style="font-size:10px; color:${colorClass}; text-transform:uppercase; font-weight:bold;">Total Bobot</div>
            <div style="font-size:18px; font-weight:bold; color:${colorClass};">${s.totalBobot > 0 ? '+' + s.totalBobot : s.totalBobot}</div>
          </div>
        </div>
        
        <div style="display: flex; gap: 10px; justify-content: space-between;">
          <div style="flex: 1; background: #f3e5f5; border-radius: 6px; padding: 8px; text-align: center;">
            <div style="font-size: 10px; color: #6a1b9a; font-weight: bold;">SIKAP POSITIF</div>
            <div style="font-size: 14px; font-weight: bold; color: #8e24aa;">+${s.positif}</div>
          </div>
          <div style="flex: 1; background: #fff3e0; border-radius: 6px; padding: 8px; text-align: center;">
            <div style="font-size: 10px; color: #e65100; font-weight: bold;">PELANGGARAN</div>
            <div style="font-size: 14px; font-weight: bold; color: #ef6c00;">-${s.pelanggaran}</div>
          </div>
        </div>

      </div>
      `;
    });
  }

  html += `
    </div>
  </div>
  `;

  document.getElementById('pimpinan_bobot').innerHTML = html;
}
