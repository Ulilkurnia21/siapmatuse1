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
