// Laporan.js - Menangani pencetakan seluruh jenis Laporan (Absensi, Nilai, dll) menggunakan Supabase

// ================= PRIORITAS STATUS ABSENSI (terburuk menang) =================
// Urutan: A > C > S > I > T > H
function getPrioritasStatus(status) {
  const urutan = { 'A': 5, 'C': 4, 'S': 3, 'I': 2, 'T': 1, 'H': 0 };
  return urutan[status] !== undefined ? urutan[status] : -1;
}

const KOP_SURAT_LAPORAN = `
  <div style="text-align:center; margin-bottom:20px;">
    <img src="https://i.ibb.co.com/q3stPtZF/KOP.png" 
         style="width:100%; max-width:800px; height:auto; margin:0 auto; display:block; border:0;">
  </div>
`;

// ================= DOWNLOAD LAPORAN GURU =================
async function downloadLaporanGuru() {
  const kelas = document.getElementById('laporanKelas')?.value;
  const mapel = document.getElementById('laporanMapel')?.value;
  const bulan = document.getElementById('laporanBulan')?.value;
  const tahun = document.getElementById('laporanTahun')?.value;

  if (!kelas || !mapel || !bulan || !tahun) {
    showError('Mohon lengkapi pilihan kelas, mapel, bulan, dan tahun');
    return;
  }

  const btn = document.getElementById('btnDownloadGuru');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ MENYIAPKAN...';
  } else {
    showLoading(true, 'Sedang menyiapkan laporan guru...');
  }

  try {
    const isMC = !KELAS_REGULER.includes(kelas);
    let siswaData = [];
    if (isMC) {
      let { data, error: errSiswa } = await supaClient.from('pilihan_moving_class').select('nis, nama, mapel_moving');
      if (errSiswa) throw errSiswa;
      siswaData = (data || []).filter(s => s.mapel_moving && s.mapel_moving.split(',').map(m => m.trim()).includes(kelas));
      siswaData.sort((a, b) => a.nama.localeCompare(b.nama));
    } else {
      let { data, error: errSiswa } = await supaClient.from('data_siswa').select('nis, nama').eq('kelas', kelas).order('nama', { ascending: true });
      if (errSiswa) throw errSiswa;
      siswaData = data || [];
    }
    if (!siswaData || siswaData.length === 0) {
      throw new Error('Tidak ada data siswa di kelas ' + kelas);
    }

    const siswaMap = {};
    siswaData.forEach(s => siswaMap[s.nis] = s.nama);

    // 2. Ambil data absensi
    let absensiQuery = supaClient.from('absensi')
      .select('*')
      .eq('kelas', kelas)
      .eq('mapel', mapel)
      .eq('username_guru', App.user.username);

    let { data: absenData, error: errAbsen } = await absensiQuery;
    if (errAbsen) throw errAbsen;

    const dataPerTanggal = {};
    const semuaTanggal = new Set();
    const bulanNum = bulan === 'ALL' ? 'ALL' : parseInt(bulan);
    const tahunNum = tahun === 'ALL' ? new Date().getFullYear() : parseInt(tahun);

    if (absenData) {
      absenData.forEach(row => {
        const [yyyy, mm, dd] = row.tanggal.split('-');
        const thn = parseInt(yyyy, 10);
        const bln = parseInt(mm, 10);
        const nis = row.nis;
        const status = row.status;

        // Filter validasi siswa kelas ini
        if (!siswaMap[nis]) return;

        if (bulanNum === 'ALL' || (thn === tahunNum && bln === bulanNum)) {
          const tglStr = `${dd}/${mm}/${yyyy}`; // DD/MM/YYYY
          semuaTanggal.add(tglStr);

          if (!dataPerTanggal[tglStr]) dataPerTanggal[tglStr] = {};

          const statusLama = dataPerTanggal[tglStr][nis];
          if (!statusLama || getPrioritasStatus(status) > getPrioritasStatus(statusLama)) {
            dataPerTanggal[tglStr][nis] = status;
          }
        }
      });
    }

    // Urutkan tanggal
    const tanggalList = Array.from(semuaTanggal).sort((a, b) => {
      const [d1, m1, y1] = a.split('/');
      const [d2, m2, y2] = b.split('/');
      return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
    });

    const monthsMap = {};
    tanggalList.forEach(tgl => {
      const [dd, mm, yyyy] = tgl.split('/');
      const key = bulan === 'ALL' ? `${yyyy}-${mm}` : 'current';
      if (!monthsMap[key]) monthsMap[key] = { mm: parseInt(mm, 10), yyyy: parseInt(yyyy, 10), dates: [] };
      monthsMap[key].dates.push(tgl);
    });

    const sortedMonths = Object.values(monthsMap).sort((a, b) => {
      if (a.yyyy !== b.yyyy) return a.yyyy - b.yyyy;
      return a.mm - b.mm;
    });

    // 3. Bangun HTML
    const namaGuru = App.user.nama || App.user.username;
    const nipGuru = App.user.profil?.nip || '-';

    let html = `
    <html>
    <head>
      <style>
        @page { size: A4 landscape; margin: 1.5cm; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .page-break { page-break-after: always; }
        }
        body { font-family: Arial, sans-serif; font-size: 11px; }
        .kop { text-align:center; margin-bottom:20px; }
        .kop img { max-width:100%; height:auto; }
        .header { margin:20px 0; }
        .header-item { margin:5px 0; display: flex; }
        .label { width: 100px; font-weight: bold; }
        .value { flex: 1; }
        table { width:100%; border-collapse: collapse; margin:20px 0; font-size:10px; }
        th { background: #2e7d32 !important; color: white !important; padding: 6px; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        td { border: 1px solid #a5d6a7; padding: 4px; text-align: center; }
        .rekap-col { background: #e8f5e9 !important; font-weight: bold; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: black !important; }
        .ttd { margin-top: 50px; text-align: right; }
        .ttd div { margin-top: 60px; }
      </style>
    </head>
    <body>
    `;

    if (sortedMonths.length === 0) {
      html += `<div style="text-align:center; margin-top:50px; font-size:16px;">Belum ada data absensi untuk periode ini.</div></body></html>`;
    } else {
      sortedMonths.forEach((mObj, index) => {
        let headerKolom = '';
        mObj.dates.forEach(tgl => {
          const [dd, mm, yyyy] = tgl.split('/');
          const tglObj = new Date(yyyy, mm - 1, dd);
          const hari = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][tglObj.getDay()];
          headerKolom += `<th>${hari}<br>${dd}/${mm}</th>`;
        });

        const mNama = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][mObj.mm - 1];

        html += `
          ${KOP_SURAT_LAPORAN}
          
          <div class="header">
            <h3 style="text-align:center; margin-bottom:20px;">REKAPITULASI ABSENSI GURU MATA PELAJARAN</h3>
            
            <div class="header-item">
              <span class="label">Guru</span><span class="value">: ${namaGuru}</span>
            </div>
            <div class="header-item">
              <span class="label">NIP</span><span class="value">: ${nipGuru}</span>
            </div>
            <div class="header-item">
              <span class="label">Mata Pelajaran</span><span class="value">: ${mapel}</span>
            </div>
            <div class="header-item">
              <span class="label">Kelas</span><span class="value">: ${kelas}</span>
            </div>
            <div class="header-item">
              <span class="label">Periode</span><span class="value">: ${mNama} ${mObj.yyyy}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th rowspan="2" style="width:30px;">NO</th>
                <th rowspan="2" style="width:50px;">NIS</th>
                <th rowspan="2" style="width:200px;">NAMA SISWA</th>
                <th colspan="${mObj.dates.length}">TANGGAL PERTEMUAN</th>
                <th colspan="6">TOTAL</th>
              </tr>
              <tr>
                ${headerKolom}
                <th style="width:25px;" title="Hadir">H</th>
                <th style="width:25px;" title="Sakit">S</th>
                <th style="width:25px;" title="Izin">I</th>
                <th style="width:25px;" title="Alpha">A</th>
                <th style="width:25px;" title="Cabut">C</th>
                <th style="width:25px;" title="Terlambat">T</th>
              </tr>
            </thead>
            <tbody>
        `;

        siswaData.forEach((s, idx) => {
          html += `<tr>
            <td>${idx + 1}</td>
            <td>${s.nis}</td>
            <td style="text-align:left;">${s.nama}</td>`;

          let h = 0, a = 0, i = 0, sakit = 0, c = 0, t = 0;

          mObj.dates.forEach(tgl => {
            let status = dataPerTanggal[tgl]?.[s.nis];
            if (!status) status = 'H'; // Default Hadir

            if (status === 'H') h++;
            else if (status === 'A') a++;
            else if (status === 'I') i++;
            else if (status === 'S') sakit++;
            else if (status === 'C') c++;
            else if (status === 'T') t++;

            html += `<td>${status}</td>`;
          });

          html += `
            <td class="rekap-col">${h}</td>
            <td class="rekap-col">${sakit}</td>
            <td class="rekap-col">${i}</td>
            <td class="rekap-col">${a}</td>
            <td class="rekap-col">${c}</td>
            <td class="rekap-col">${t}</td>
          </tr>`;
        });

        html += `
            </tbody>
          </table>
          
          <div class="ttd">
            <p>Silayang, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p>Guru Mata Pelajaran,</p>
            <div>
              <b><u>${namaGuru}</u></b><br>
              NIP. ${nipGuru}
            </div>
          </div>
        `;

        if (index < sortedMonths.length - 1) html += `<div class="page-break"></div>`;
      });

      html += `</body></html>`;
    }

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '📥 DOWNLOAD LAPORAN';
    } else {
      showLoading(false);
    }

    openReportAndPrint(html);

  } catch (error) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '📥 DOWNLOAD LAPORAN';
    } else {
      showLoading(false);
    }
    showError('Gagal membuat laporan guru: ' + error.message);
  }
}


// ================= DOWNLOAD LAPORAN BULANAN (WALI KELAS) =================
async function downloadLaporanBulanan() {
  const kelas = document.getElementById('bulananKelas')?.value;
  const bulan = document.getElementById('bulananBulan')?.value;
  const tahun = document.getElementById('bulananTahun')?.value;

  if (!kelas || !bulan || !tahun) {
    showError('Mohon lengkapi pilihan kelas, bulan, dan tahun');
    return;
  }

  const btn = document.getElementById('btnDownloadBulanan');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '⏳ MENYIAPKAN...';
  } else {
    showLoading(true, 'Sedang menyiapkan rekap bulanan...');
  }

  try {
    const isMC = !KELAS_REGULER.includes(kelas);
    let siswaData = [];
    if (isMC) {
      let { data, error: errSiswa } = await supaClient.from('pilihan_moving_class').select('nis, nama, mapel_moving');
      if (errSiswa) throw errSiswa;
      siswaData = (data || []).filter(s => s.mapel_moving && s.mapel_moving.split(',').map(m => m.trim()).includes(kelas));
      siswaData.sort((a, b) => a.nama.localeCompare(b.nama));
    } else {
      let { data, error: errSiswa } = await supaClient.from('data_siswa').select('nis, nama').eq('kelas', kelas).order('nama', { ascending: true });
      if (errSiswa) throw errSiswa;
      siswaData = data || [];
    }
    if (!siswaData || siswaData.length === 0) {
      throw new Error('Tidak ada data siswa di kelas ' + kelas);
    }

    const bulanNum = bulan === 'ALL' ? 'ALL' : parseInt(bulan, 10);
    const tahunNum = tahun === 'ALL' ? 'ALL' : parseInt(tahun, 10);

    // 2. Ambil absensi
    // Untuk kelas reguler: ambil semua absensi berdasarkan NIS siswa (termasuk absensi dari mapel pilihan)
    // Untuk kelas MC: filter ketat berdasarkan kelas
    let absenData = [];
    if (isMC) {
      let { data, error: errAbsen } = await supaClient.from('absensi')
        .select('*')
        .eq('kelas', kelas);
      if (errAbsen) throw errAbsen;
      absenData = data || [];
    } else {
      const nisList = siswaData.map(s => s.nis);
      let { data, error: errAbsen } = await supaClient.from('absensi')
        .select('*')
        .in('nis', nisList);
      if (errAbsen) throw errAbsen;
      absenData = data || [];
    }

    // Group statusHarian dan statusJam by month
    const monthsMap = {}; // key: YYYY-MM atau 'current'

    if (absenData.length > 0) {
      absenData.forEach(row => {
        const [yyyy, mm, dd] = row.tanggal.split('-');
        const thn = parseInt(yyyy, 10);
        const bln = parseInt(mm, 10);
        const nis = row.nis;
        const status = row.status;

        // Skip jika nis tidak terdaftar di kelas ini
        const isSiswaExist = siswaData.some(s => s.nis === nis);
        if (!isSiswaExist) return;

        const isTahunMatch = tahunNum === 'ALL' || thn === tahunNum;
        const isBulanMatch = bulanNum === 'ALL' || bln === bulanNum;

        if (isTahunMatch && isBulanMatch) {
          const key = bulanNum === 'ALL' ? `${yyyy}-${mm}` : 'current';
          if (!monthsMap[key]) {
            monthsMap[key] = {
              yyyy: thn,
              mm: bln,
              statusHarian: {},
              statusJam: {}
            };
          }

          if (!monthsMap[key].statusHarian[nis]) monthsMap[key].statusHarian[nis] = {};
          if (!monthsMap[key].statusJam[nis]) monthsMap[key].statusJam[nis] = {};

          const tglStr = row.tanggal;
          const statusLama = monthsMap[key].statusHarian[nis][tglStr];

          // Simpan hanya jika status baru lebih buruk
          if (!statusLama || getPrioritasStatus(status) > getPrioritasStatus(statusLama)) {
            monthsMap[key].statusHarian[nis][tglStr] = status;
          }

          if (!monthsMap[key].statusJam[nis][tglStr]) monthsMap[key].statusJam[nis][tglStr] = {};
          const statusJamLama = monthsMap[key].statusJam[nis][tglStr][row.jam];
          if (!statusJamLama || getPrioritasStatus(status) > getPrioritasStatus(statusJamLama)) {
            monthsMap[key].statusJam[nis][tglStr][row.jam] = status;
          }
        }
      });
    }

    const sortedMonths = Object.values(monthsMap).sort((a, b) => {
          if (a.yyyy !== b.yyyy) return a.yyyy - b.yyyy;
          return a.mm - b.mm;
        });

        // Ambil data Wali Kelas
        let namaWali = '(Kosong / Tidak Ditemukan)';
        let nipWali = '-';
        let { data: guruData } = await supaClient.from('data_guru').select('nama, nip').eq('wali_kelas', kelas).limit(1);
        if (guruData && guruData.length > 0) {
          namaWali = guruData[0].nama;
          nipWali = guruData[0].nip || '-';
        }

        let html = `
    <html>
    <head>
      <style>
        @page { size: A4 landscape; margin: 1.5cm; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .page-break { page-break-after: always; }
        }
        body { font-family: Arial, sans-serif; font-size: 11px; }
        .kop { text-align:center; margin-bottom:20px; }
        .kop img { max-width:100%; height:auto; }
        .header { margin:20px 0; }
        .header-item { margin:5px 0; display: flex; }
        .label { width: 100px; font-weight: bold; }
        .value { flex: 1; }
        table { width:100%; border-collapse: collapse; margin:20px 0; font-size:11px; }
        th { background: #2e7d32 !important; color: white !important; padding: 8px; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        td { border: 1px solid #a5d6a7; padding: 6px; text-align: center; }
        .ttd { margin-top: 50px; text-align: right; }
        .ttd div { margin-top: 60px; }
        .rekap-col { background: #e8f5e9 !important; font-weight: bold; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: black !important; }
      </style>
    </head>
    <body>
    `;

        if (sortedMonths.length === 0) {
          html += `<div style="text-align:center; margin-top:50px; font-size:16px;">Belum ada data absensi untuk periode ini.</div></body></html>`;
        } else {
          sortedMonths.forEach((mObj, index) => {
            const mNama = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][mObj.mm - 1];

            // Hitung rekap untuk bulan ini
            const rekap = {};
            siswaData.forEach(s => {
              rekap[s.nis] = { H: 0, A: 0, I: 0, S: 0, C: 0, T: 0 };
            });

            const statusHarian = mObj.statusHarian;
            for (const nis in statusHarian) {
              for (const tglStr in statusHarian[nis]) {
                const status = statusHarian[nis][tglStr];
                if (rekap[nis]) {
                  if (status === 'H') rekap[nis].H++;
                  else if (status === 'A') rekap[nis].A++;
                  else if (status === 'I') rekap[nis].I++;
                  else if (status === 'S') rekap[nis].S++;
                  else if (status === 'C') rekap[nis].C++;
                  else if (status === 'T') rekap[nis].T++;
                }
              }
            }

            html += `
          ${KOP_SURAT_LAPORAN}
          
          <div class="header">
            <h3 style="text-align:center; margin-bottom:20px; text-transform:uppercase;">REKAPITULASI ABSENSI BULANAN KELAS</h3>
            
            <div class="header-item">
              <span class="label">Kelas</span><span class="value">: ${kelas}</span>
            </div>
            <div class="header-item">
              <span class="label">Wali Kelas</span><span class="value">: ${namaWali}</span>
            </div>
            <div class="header-item">
              <span class="label">Periode</span><span class="value">: ${mNama} ${mObj.yyyy}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th rowspan="2" style="width:30px;">NO</th>
                <th rowspan="2" style="width:80px;">NIS</th>
                <th rowspan="2">NAMA SISWA</th>
                <th colspan="6">TOTAL KEHADIRAN / KETIDAKHADIRAN</th>
              </tr>
              <tr>
                <th style="width:40px;" title="Hadir">H</th>
                <th style="width:40px;" title="Sakit">S</th>
                <th style="width:40px;" title="Izin">I</th>
                <th style="width:40px;" title="Alpha">A</th>
                <th style="width:40px;" title="Cabut">C</th>
                <th style="width:40px;" title="Terlambat">T</th>
              </tr>
            </thead>
            <tbody>
        `;

            siswaData.forEach((s, idx) => {
              const r = rekap[s.nis];
              html += `<tr>
            <td>${idx + 1}</td>
            <td>${s.nis}</td>
            <td style="text-align:left;">${s.nama}</td>
            <td class="rekap-col">${r.H}</td>
            <td class="rekap-col">${r.S}</td>
            <td class="rekap-col">${r.I}</td>
            <td class="rekap-col">${r.A}</td>
            <td class="rekap-col">${r.C}</td>
            <td class="rekap-col">${r.T}</td>
          </tr>`;
            });

            html += `
            </tbody>
          </table>
          
          <div class="ttd">
            <p>Silayang, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p>Wali Kelas</p>
            <div>
              <b><u>${namaWali}</u></b><br>
              NIP. ${nipWali}
            </div>
          </div>
        `;

            // ================= DETAIL MINGGUAN =================
            const mingguArray = [];
            let mingguKe = 1;
            let startDate = new Date(mObj.yyyy, mObj.mm - 1, 1);
            while (startDate.getDay() !== 1) {
              startDate.setDate(startDate.getDate() + 1);
            }

            while (startDate.getMonth() + 1 === mObj.mm && startDate.getFullYear() === mObj.yyyy) {
              const minggu = {
                mingguKe: mingguKe,
                tanggalMulai: new Date(startDate),
                tanggalAkhir: new Date(startDate.getTime() + 5 * 24 * 60 * 60 * 1000), // Sabtu
                hari: []
              };

              for (let i = 0; i < 6; i++) {
                const tglHari = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
                const tglStr = `${tglHari.getFullYear()}-${String(tglHari.getMonth() + 1).padStart(2, '0')}-${String(tglHari.getDate()).padStart(2, '0')}`;
                const hariNama = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][i];
                minggu.hari.push({ tanggal: tglStr, nama: hariNama, tglDisplay: `${String(tglHari.getDate()).padStart(2, '0')}/${String(tglHari.getMonth() + 1).padStart(2, '0')}` });
              }
              mingguArray.push(minggu);

              startDate.setDate(startDate.getDate() + 7);
              mingguKe++;
            }

            mingguArray.forEach((minggu, mIdx) => {
              // Cek apakah ada data di minggu ini
              const adaDataMinggu = minggu.hari.some(h => {
                return siswaData.some(s => {
                  if (!mObj.statusJam || !mObj.statusJam[s.nis] || !mObj.statusJam[s.nis][h.tanggal]) return false;
                  const jamMap = mObj.statusJam[s.nis][h.tanggal];
                  return Object.keys(jamMap).length > 0;
                });
              });
              if (!adaDataMinggu) return; // Skip minggu kosong
              html += `<div class="page-break"></div>`;
              html += `
            ${KOP_SURAT_LAPORAN}
            <div class="header">
              <h3 style="text-align:center; margin-bottom:20px; text-transform:uppercase;">ABSENSI PESERTA DIDIK</h3>
              <div class="header-item"><span class="label">Kelas</span><span class="value">: ${kelas}</span></div>
              <div class="header-item"><span class="label">Wali Kelas</span><span class="value">: ${namaWali}</span></div>
              <div class="header-item"><span class="label">Periode</span><span class="value">: Minggu ${minggu.mingguKe} (${minggu.tanggalMulai.toLocaleDateString('id-ID')} - ${minggu.tanggalAkhir.toLocaleDateString('id-ID')})</span></div>
            </div>
          `;

              let headerAtas = '';
              let headerBawah = '';
              minggu.hari.forEach(h => {
                headerAtas += `<th colspan="9">${h.nama}<br>${h.tglDisplay}</th>`;
                headerBawah += `<th style="width:12px;">1</th><th style="width:12px;">2</th><th style="width:12px;">3</th><th style="width:12px;">4</th><th style="width:12px;">5</th><th style="width:12px;">6</th><th style="width:12px;">7</th><th style="width:12px;">8</th><th style="width:12px;">9</th>`;
              });

              html += `
          <table>
            <thead>
              <tr>
                <th rowspan="2" style="width:20px;">No</th>
                <th rowspan="2" style="width:150px;">Nama</th>
                ${headerAtas}
              </tr>
              <tr>
                ${headerBawah}
              </tr>
            </thead>
            <tbody>
          `;

              siswaData.forEach((s, idx) => {
                html += `<tr><td>${idx + 1}</td><td style="text-align:left;">${s.nama}</td>`;
                minggu.hari.forEach(h => {
                  for (let jam = 1; jam <= 9; jam++) {
                    let status = '';
                    if (mObj.statusJam && mObj.statusJam[s.nis] && mObj.statusJam[s.nis][h.tanggal]) {
                      status = mObj.statusJam[s.nis][h.tanggal][jam] || '';
                    }
                    html += `<td>${status}</td>`;
                  }
                });
                html += `</tr>`;
              });

              html += `
            </tbody>
          </table>
          <div class="ttd">
            <p>Silayang, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p>Wali Kelas</p>
            <div>
              <b><u>${namaWali}</u></b><br>
              NIP. ${nipWali}
            </div>
          </div>
          `;
            });

            if (index < sortedMonths.length - 1) html += `<div class="page-break"></div>`;
          });
          html += `</body></html>`;
        }

        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '📥 DOWNLOAD LAPORAN';
        } else {
          showLoading(false);
        }

        openReportAndPrint(html);

      } catch (error) {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '📥 DOWNLOAD LAPORAN';
        } else {
          showLoading(false);
        }
        showError('Gagal membuat rekap bulanan: ' + error.message);
      }
    }


// =============================================================

// =============================================================
// ============ LAPORAN NILAI =================================
// =============================================================

// ---- Laporan Nilai (download/print) ----
function showDownloadLaporanNilaiModal() {
  const kelas = document.getElementById('laporanNilaiKelas').value;
  const mapel = document.getElementById('laporanNilaiMapel').value;
  if (!kelas || !mapel) {
    showError('Pilih kelas dan mata pelajaran!');
    return;
  }
  document.getElementById('modalDownloadNilai').style.display = 'flex';
}

async function downloadLaporanNilai(format) {
  document.getElementById('modalDownloadNilai').style.display = 'none';
  const kelas = document.getElementById('laporanNilaiKelas').value;
  const mapel = document.getElementById('laporanNilaiMapel').value;
  const siswaContainer = document.getElementById('containerLaporanNilaiSiswa');
  const filterSiswa = (siswaContainer && siswaContainer.style.display !== 'none')
    ? document.getElementById('laporanNilaiSiswa').value : 'ALL';

  if (!kelas || !mapel) {
    showError('Pilih kelas dan mata pelajaran!');
    return;
  }

  const btn = document.getElementById('btnDownloadNilai');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ MENYIAPKAN...'; }

  try {
    // Ambil data siswa
    const isMC = !KELAS_REGULER.includes(kelas);
    let siswaData = [];
    if (isMC) {
      const { data, error } = await supaClient.from('pilihan_moving_class').select('nis, nama, mapel_moving');
      if (error) throw error;
      siswaData = (data || []).filter(s => s.mapel_moving && s.mapel_moving.split(',').map(m => m.trim()).includes(kelas));
      siswaData.sort((a, b) => a.nama.localeCompare(b.nama));
    } else {
      const { data, error } = await supaClient.from('data_siswa').select('nis, nama').eq('kelas', kelas).order('nama', { ascending: true });
      if (error) throw error;
      siswaData = data || [];
    }
    if (filterSiswa !== 'ALL') {
      siswaData = siswaData.filter(s => s.nis === filterSiswa);
    }
    if (siswaData.length === 0) throw new Error('Tidak ada data siswa');

    // Ambil semua nilai untuk kelas & mapel ini
    const { data: nilaiData, error: nilaiError } = await supaClient
      .from('nilai')
      .select('*')
      .eq('kelas', kelas)
      .eq('matapelajaran', mapel)
      .eq('username_guru', App.user.username)
      .order('jenistugas', { ascending: true })
      .order('nopenilaian', { ascending: true });
    if (nilaiError) throw nilaiError;

    // Susun struktur: { jenis+no: { nis: nilai } }
    const kolom = []; // [{label, key}]
    const kolomSet = new Set();
    const nilaiMap = {}; // nis -> { key -> nilai }

    (nilaiData || []).forEach(row => {
      const key = `${row.jenistugas}${row.nopenilaian}`;
      if (!kolomSet.has(key)) { kolomSet.add(key); kolom.push({ label: key, key }); }
      if (!nilaiMap[row.nis]) nilaiMap[row.nis] = {};
      nilaiMap[row.nis][key] = row.nilai;
    });

    const namaGuru = App.user.nama || App.user.username;
    const nipGuru = App.user.profil?.nip || '-';

    // Hitung rata-rata per siswa (nilai kosong = 0, tetap dihitung)
    // Total kolom yang ada adalah jumlah kolom penilaian
    const totalKolom = kolom.length;

    const siswaDenganRata = siswaData.map(s => {
      let total = 0;
      kolom.forEach(k => {
        const v = nilaiMap[s.nis] ? nilaiMap[s.nis][k.key] : undefined;
        total += (v !== undefined && v !== null) ? parseFloat(v) : 0;
      });
      const rata = totalKolom > 0 ? total / totalKolom : 0;
      return { ...s, rata: rata };
    });

    // Hitung rangking: rata tertinggi = rangking 1
    // Siswa dengan rata sama mendapat rangking yang sama (dense ranking)
    const sortedRata = [...siswaDenganRata].sort((a, b) => b.rata - a.rata);
    const rangkingMap = {};
    let rank = 1;
    sortedRata.forEach((s, i) => {
      if (i > 0 && s.rata < sortedRata[i - 1].rata) rank = i + 1;
      rangkingMap[s.nis] = rank;
    });

    // Bangun HTML tabel
    let thKolom = kolom.map(k => `<th>${k.label}</th>`).join('');
    let tbody = '';
    siswaDenganRata.forEach((s, idx) => {
      const vals = kolom.map(k => {
        const v = nilaiMap[s.nis] ? nilaiMap[s.nis][k.key] : undefined;
        const tampil = (v !== undefined && v !== null) ? v : 0;
        return `<td>${tampil}</td>`;
      }).join('');
      const rataStr = s.rata.toFixed(2);
      const rankStr = rangkingMap[s.nis];
      tbody += `<tr><td>${idx+1}</td><td>${s.nis}</td><td style="text-align:left">${s.nama}</td>${vals}<td style="background:#fff9c4;font-weight:bold;">${rataStr}</td><td style="background:#e3f2fd;font-weight:bold;">${rankStr}</td></tr>`;
    });

    const html = `
    <html><head>
    <style>
      @page { size: A4 landscape; margin: 1.5cm; }
      @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
      body { font-family: Arial, sans-serif; font-size: 11px; }
      table { width:100%; border-collapse:collapse; margin:20px 0; font-size:10px; }
      th { background:#1565c0 !important; color:white !important; padding:6px; text-align:center; }
      td { border:1px solid #90caf9; padding:4px; text-align:center; }
      .header-item { margin:5px 0; display:flex; }
      .label { width:130px; font-weight:bold; }
    </style>
    </head><body>
    ${KOP_SURAT_LAPORAN}
    <h3 style="text-align:center;">REKAPITULASI NILAI MATA PELAJARAN</h3>
    <div class="header-item"><span class="label">Guru</span><span>: ${namaGuru}</span></div>
    <div class="header-item"><span class="label">NIP</span><span>: ${nipGuru}</span></div>
    <div class="header-item"><span class="label">Mata Pelajaran</span><span>: ${mapel}</span></div>
    <div class="header-item"><span class="label">Kelas</span><span>: ${kelas}</span></div>
    <table>
      <thead><tr><th>No</th><th>NIS</th><th>Nama Siswa</th>${thKolom}<th style="background:#f9a825 !important;">RATA-RATA</th><th style="background:#1976d2 !important;">RANGKING</th></tr></thead>
      <tbody>${tbody}</tbody>
    </table>
    <div style="margin-top:50px; text-align:right;">
      <p>Silayang, ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <p>Guru Mata Pelajaran,</p>
      <div style="margin-top:60px;"><b><u>${namaGuru}</u></b><br>NIP. ${nipGuru}</div>
    </div>
    </body></html>`;

    if (format === 'excel') {
      const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Laporan_Nilai_${kelas}_${mapel}.xls`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } else {
      openReportAndPrint(html);
    }

    if (btn) { btn.disabled = false; btn.innerHTML = '📥 DOWNLOAD NILAI'; }
  } catch (error) {
    if (btn) { btn.disabled = false; btn.innerHTML = '📥 DOWNLOAD NILAI'; }
    showError('Gagal membuat laporan nilai: ' + error.message);
  }
}

// Ganti updateLaporanNilaiFilter dari google.script.run ke Supabase
async function updateLaporanNilaiFilter() {
  const kelas = document.getElementById('laporanNilaiKelas').value;
  const mapelSelect = document.getElementById('laporanNilaiMapel');
  const siswaContainer = document.getElementById('containerLaporanNilaiSiswa');
  const siswaSelect = document.getElementById('laporanNilaiSiswa');

  if (!kelas) {
    mapelSelect.innerHTML = '<option value="">Pilih Mapel</option>';
    siswaContainer.style.display = 'none';
    siswaSelect.innerHTML = '<option value="ALL">Seluruh Siswa</option>';
    return;
  }

  // Populate Mapel Options dari data guru
  let mapelOptions = '<option value="">Pilih Mapel</option>';
  if (App.guruData?.mapelList && App.guruData.mapelList.length > 0) {
    App.guruData.mapelList.forEach(m => mapelOptions += `<option value="${m}">${m}</option>`);
  }
  mapelSelect.innerHTML = mapelOptions;

  // Tampilkan filter siswa dari Supabase
  siswaContainer.style.display = 'block';
  siswaSelect.innerHTML = '<option value="ALL">Memuat data siswa...</option>';

  try {
    const isMC = !KELAS_REGULER.includes(kelas);
    let siswaData = [];
    if (isMC) {
      const { data, error } = await supaClient.from('pilihan_moving_class').select('nis, nama, mapel_moving');
      if (error) throw error;
      siswaData = (data || []).filter(s => s.mapel_moving && s.mapel_moving.split(',').map(m => m.trim()).includes(kelas));
      siswaData.sort((a, b) => a.nama.localeCompare(b.nama));
    } else {
      const { data, error } = await supaClient.from('data_siswa').select('nis, nama').eq('kelas', kelas).order('nama', { ascending: true });
      if (error) throw error;
      siswaData = data || [];
    }
    let siswaOptions = '<option value="ALL">Seluruh Siswa</option>';
    siswaData.forEach(s => { siswaOptions += `<option value="${s.nis}">${s.nama}</option>`; });
    siswaSelect.innerHTML = siswaOptions;
  } catch (e) {
    siswaSelect.innerHTML = '<option value="ALL">Seluruh Siswa</option>';
  }
}


// ================= DOWNLOAD LAPORAN SHALAT =================
    async function downloadLaporanShalat() {
  const kelas = document.getElementById('shalatLaporanKelas').value;
  const bulan = document.getElementById('shalatLaporanBulan').value;
  const tahun = document.getElementById('shalatLaporanTahun').value;

  if (!kelas) { showError('Pilih kelas!'); return; }

  const btn = document.getElementById('btnDownloadShalat');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ MENYIAPKAN...'; }

  try {
    // 1. Get Data Siswa
    const isMC = !KELAS_REGULER.includes(kelas);
    let siswaData = [];
    if (isMC) {
      const { data, error } = await supaClient.from('pilihan_moving_class').select('nis, nama, mapel_moving');
      if (error) throw error;
      siswaData = (data || []).filter(s => s.mapel_moving && s.mapel_moving.split(',').map(m => m.trim()).includes(kelas));
      siswaData.sort((a, b) => a.nama.localeCompare(b.nama));
    } else {
      const { data, error } = await supaClient.from('data_siswa').select('nis, nama').eq('kelas', kelas).order('nama', { ascending: true });
      if (error) throw error;
      siswaData = data || [];
    }

    // 2. Get Wali Kelas
    let namaWali = '(Kosong / Tidak Ditemukan)';
    let nipWali = '-';
    let { data: guruData } = await supaClient.from('data_guru').select('nama, nip').eq('wali_kelas', kelas).limit(1);
    if (guruData && guruData.length > 0) {
      namaWali = guruData[0].nama;
      nipWali = guruData[0].nip || '-';
    }

    // 3. Get Data Shalat
    let query = supaClient
      .from('shalat')
      .select('nis, nama, kelas, tanggal, status, jumlah')
      .eq('kelas', kelas)
      .order('tanggal', { ascending: true });

    if (bulan && bulan !== 'ALL') {
      const y = (tahun && tahun !== 'ALL') ? tahun : new Date().getFullYear();
      const m = bulan.toString().padStart(2, '0');
      query = query.gte('tanggal', `${y}-${m}-01`).lte('tanggal', `${y}-${m}-31`);
    } else if (tahun && tahun !== 'ALL') {
      query = query.gte('tanggal', `${tahun}-01-01`).lte('tanggal', `${tahun}-12-31`);
    }

    const { data: shalatData, error: shalatError } = await query;
    if (btn) { btn.disabled = false; btn.innerHTML = '📥 DOWNLOAD LAPORAN'; }
    if (shalatError) throw shalatError;

    // 4. Group by Month
    const monthsMap = {};
    if (shalatData && shalatData.length > 0) {
      shalatData.forEach(row => {
        const tglStr = row.tanggal;
        const yyyy = parseInt(tglStr.split('-')[0]);
        const mm = parseInt(tglStr.split('-')[1]);
        const key = `${yyyy}-${mm}`;
        
        if (!monthsMap[key]) {
          monthsMap[key] = { yyyy, mm, records: [] };
        }
        monthsMap[key].records.push(row);
      });
    } else {
      // If no data at all, just create a dummy map for the selected month to show empty table
      const y = (tahun && tahun !== 'ALL') ? parseInt(tahun) : new Date().getFullYear();
      const m = (bulan && bulan !== 'ALL') ? parseInt(bulan) : new Date().getMonth() + 1;
      monthsMap[`${y}-${m}`] = { yyyy: y, mm: m, records: [] };
    }

    const sortedMonths = Object.values(monthsMap).sort((a, b) => {
      if (a.yyyy !== b.yyyy) return a.yyyy - b.yyyy;
      return a.mm - b.mm;
    });

    const BULAN_NAMA = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

    let html = `
    <html>
    <head>
      <style>
        @page { size: A4 landscape; margin: 1.5cm; }
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .page-break { page-break-after: always; }
        }
        body { font-family: Arial, sans-serif; font-size: 11px; }
        .kop { text-align:center; margin-bottom:20px; }
        .kop img { max-width:100%; height:auto; }
        .header { margin:20px 0; }
        .header-item { margin:5px 0; display: flex; }
        .label { width: 100px; font-weight: bold; }
        .value { flex: 1; }
        table { width:100%; border-collapse: collapse; margin:20px 0; font-size:11px; }
        th { background: #2e7d32 !important; color: white !important; padding: 8px; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        td { border: 1px solid #a5d6a7; padding: 6px; text-align: center; }
        .ttd { margin-top: 50px; text-align: right; }
        .ttd div { margin-top: 60px; }
        .rekap-col { background: #e8f5e9 !important; font-weight: bold; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: black !important; }
      </style>
    </head>
    <body>
    `;

    sortedMonths.forEach((mObj, index) => {
      const mNama = BULAN_NAMA[mObj.mm];
      
      const rekap = {};
      siswaData.forEach(s => {
        rekap[s.nis] = { nama: s.nama, Y: 0, T: 0, H: 0, totalJml: 0, totalJmlSejakAgustus: 0, hariAdaSejakAgustus: 0 };
      });

      mObj.records.forEach(row => {
        if (rekap[row.nis]) {
          rekap[row.nis][row.status] = (rekap[row.nis][row.status] || 0) + 1;
          rekap[row.nis].totalJml += (row.jumlah || 0);
          
          if (row.tanggal >= '2026-08-10') {
            rekap[row.nis].totalJmlSejakAgustus += (row.jumlah || 0);
            rekap[row.nis].hariAdaSejakAgustus++;
          }
        }
      });

      html += `
        ${KOP_SURAT_LAPORAN}
        <div class="header">
          <h3 style="text-align:center; margin-bottom:20px; text-transform:uppercase;">REKAPITULASI ABSENSI SHALAT</h3>
          <div class="header-item"><span class="label">Kelas</span><span class="value">: ${kelas}</span></div>
          <div class="header-item"><span class="label">Wali Kelas</span><span class="value">: ${namaWali}</span></div>
          <div class="header-item"><span class="label">Periode</span><span class="value">: ${mNama} ${mObj.yyyy}</span></div>
        </div>
        <table>
          <thead>
            <tr>
              <th rowspan="2" style="width:30px;">NO</th>
              <th rowspan="2" style="width:80px;">NIS</th>
              <th rowspan="2">NAMA SISWA</th>
              <th colspan="3">PELAKSANAAN SHALAT</th>
              <th rowspan="2" style="width:70px;">TOTAL HARI</th>
              <th rowspan="2" style="width:80px;">TOTAL SHALAT</th>
              <th rowspan="2" style="width:90px;">RATA-RATA</th>
            </tr>
            <tr>
              <th style="width:50px;">Ya (Y)</th>
              <th style="width:50px;">Tidak (T)</th>
              <th style="width:50px;">Haid (H)</th>
            </tr>
          </thead>
          <tbody>
      `;

      siswaData.forEach((s, idx) => {
        const d = rekap[s.nis];
        const total = d.Y + d.T + d.H;
        const rataRata = d.hariAdaSejakAgustus > 0 ? Math.round(d.totalJmlSejakAgustus / d.hariAdaSejakAgustus) : 'Belum ada data';
        const totalJmlDisplay = d.hariAdaSejakAgustus > 0 ? d.totalJmlSejakAgustus : 'Belum ada data';
        
        html += `
          <tr>
            <td>${idx + 1}</td>
            <td>${s.nis}</td>
            <td style="text-align:left">${s.nama}</td>
            <td>${d.Y}</td>
            <td>${d.T}</td>
            <td>${d.H}</td>
            <td class="rekap-col">${total}</td>
            <td class="rekap-col">${totalJmlDisplay}</td>
            <td class="rekap-col">${rataRata}</td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
        
        <div class="ttd">
          Silayang, ${new Date().getDate()} ${mNama} ${new Date().getFullYear()}<br>
          Wali Kelas<br>
          <div></div>
          <b><u>${namaWali}</u></b><br>
          NIP. ${nipWali}
        </div>
      `;

      if (index < sortedMonths.length - 1) {
        html += '<div class="page-break"></div>';
      }
    });

    html += '</body></html>';
    openReportAndPrint(html);

  } catch (err) {
    if (btn) { btn.disabled = false; btn.innerHTML = '📥 DOWNLOAD LAPORAN'; }
    showError('Gagal membuat laporan shalat: ' + err.message);
  }
}

// ================= DOWNLOAD LAPORAN SIKAP (Catatan & Pelanggaran) =================
async function downloadLaporanSikap() {
  const kelas = document.getElementById('laporanSikapKelas')?.value;
  const tahun = document.getElementById('laporanSikapTahun')?.value;
  const jenis = document.getElementById('laporanSikapJenis')?.value || 'tanggal';

  if (!kelas || !tahun) {
    showError('Mohon pilih kelas dan tahun terlebih dahulu');
    return;
  }

  const btn = document.getElementById('btnDownloadSikap');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ MENYIAPKAN...'; }

  try {
    const tglStart = `${tahun}-01-01`;
    const tglEnd = `${tahun}-12-31`;

    // Tarik catatan, pelanggaran, master_dimensi, dan guru secara bersamaan
    const [resCatatan, resPelanggaran, resDimensi, resGuru] = await Promise.all([
      supaClient.from('catatan').select('*').eq('kelas', kelas).gte('tanggal', tglStart).lte('tanggal', tglEnd).order('tanggal', { ascending: true }),
      supaClient.from('pelanggaran').select('*').eq('kelas', kelas).gte('tanggal', tglStart).lte('tanggal', tglEnd).order('tanggal', { ascending: true }),
      supaClient.from('master_dimensi').select('*'),
      supaClient.from('data_guru').select('nama, nip').eq('wali_kelas', kelas).limit(1)
    ]);

    if (resCatatan.error) throw resCatatan.error;
    if (resPelanggaran.error) throw resPelanggaran.error;

    // Data Wali Kelas
    let namaWali = '(Kosong / Tidak Ditemukan)';
    let nipWali = '-';
    if (resGuru.data && resGuru.data.length > 0) {
      namaWali = resGuru.data[0].nama;
      nipWali = resGuru.data[0].nip || '-';
    }

    // Buat map dimensi untuk lookup cepat
    const dimensiMap = {};
    (resDimensi.data || []).forEach(d => { dimensiMap[d.id] = d; });

    // Gabungkan dengan label tipe
    const dataCatatan = (resCatatan.data || []).map(r => {
      const elemenEntry = dimensiMap[r.dimensi_id];
      return {
        ...r,
        tipe: 'POSITIF',
        kategori: elemenEntry ? elemenEntry.dimensi : '-',
        detail: elemenEntry ? elemenEntry.elemen : '-',
        keterangan: r.catatan || '-',
        guru: r.username_guru || '-'
      };
    });

    const dataPelanggaran = (resPelanggaran.data || []).map(r => ({
      ...r,
      tipe: 'NEGATIF',
      kategori: r.jenis || '-',
      detail: r.perilaku || '-',
      keterangan: r.tindak_lanjut || '-',
      guru: r.username_guru || '-'
    }));

    const semua = [...dataCatatan, ...dataPelanggaran].sort((a, b) => a.tanggal.localeCompare(b.tanggal));

    if (semua.length === 0) {
      if (btn) { btn.disabled = false; btn.innerHTML = '📥 DOWNLOAD PDF'; }
      showError('Tidak ada data sikap untuk kelas ' + kelas + ' tahun ' + tahun);
      return;
    }

    const BULAN_NAMA = ['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

    const cssBase = `
      @page { size: A4 landscape; margin: 1.5cm; }
      @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
      body { font-family: Arial, sans-serif; font-size: 10px; }
      table { width:100%; border-collapse: collapse; margin:15px 0; font-size:10px; }
      th { background: #2e7d32 !important; color: white !important; padding: 7px; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      td { border: 1px solid #a5d6a7; padding: 5px; vertical-align: top; }
      .positif { background: #e8f5e9 !important; color: #1b5e20 !important; font-weight: bold; }
      .negatif { background: #ffebee !important; color: #b71c1c !important; font-weight: bold; }
      .ttd { margin-top: 50px; text-align: right; }
      .ttd div { margin-top: 60px; }
      h3 { text-align:center; text-transform:uppercase; margin-bottom:20px; }
    `;

    let html = `<html><head><style>${cssBase}</style></head><body>`;

    const now = new Date();
    const bulanNama = BULAN_NAMA[now.getMonth() + 1];
    const ttdHtml = `
      <div class="ttd">
        Silayang, ${now.getDate()} ${bulanNama} ${now.getFullYear()}<br>
        Wali Kelas<br>
        <div></div>
        <b><u>${namaWali}</u></b><br>
        NIP. ${nipWali}
      </div>
    `;

    if (jenis === 'tanggal') {
      // ============ FORMAT PER TANGGAL ============
      html += KOP_SURAT_LAPORAN;
      html += `<h3>Laporan Sikap Siswa — Kelas ${kelas} Tahun ${tahun}</h3>`;
      html += `<div style="margin-bottom:10px; font-size:11px;">Kelas: <b>${kelas}</b> &nbsp;|&nbsp; Tahun: <b>${tahun}</b> &nbsp;|&nbsp; Total Data: <b>${semua.length}</b></div>`;
      html += `<table>
        <thead>
          <tr>
            <th style="width:30px;">No</th>
            <th style="width:75px;">Tanggal</th>
            <th style="width:130px;">Nama Siswa</th>
            <th style="width:50px;">NIS</th>
            <th style="width:60px;">Tipe</th>
            <th style="width:100px;">Dimensi/Jenis</th>
            <th style="width:120px;">Elemen/Perilaku</th>
            <th style="width:30px;">Poin</th>
            <th>Catatan / Tindak Lanjut</th>
            <th style="width:90px;">Guru</th>
          </tr>
        </thead>
        <tbody>`;

      semua.forEach((item, i) => {
        const tipeClass = item.tipe === 'POSITIF' ? 'positif' : 'negatif';
        html += `<tr>
          <td style="text-align:center;">${i + 1}</td>
          <td style="text-align:center;">${item.tanggal}</td>
          <td>${item.nama || '-'}</td>
          <td style="text-align:center;">${item.nis || '-'}</td>
          <td class="${tipeClass}" style="text-align:center;">${item.tipe}</td>
          <td>${item.kategori}</td>
          <td>${item.detail}</td>
          <td style="text-align:center;">${item.poin || 0}</td>
          <td>${item.keterangan}</td>
          <td>${item.guru}</td>
        </tr>`;
      });

      const totalPositif = semua.filter(r => r.tipe === 'POSITIF').reduce((s, r) => s + (r.poin || 0), 0);
      const totalNegatif = semua.filter(r => r.tipe === 'NEGATIF').reduce((s, r) => s + (r.poin || 0), 0);
      const netTotal = totalPositif - totalNegatif;
      
      let netColor = '';
      let netDisplay = netTotal;
      if (netTotal > 0) {
        netColor = 'color:#2e7d32;';
        netDisplay = '+' + netTotal;
      } else if (netTotal < 0) {
        netColor = 'color:#b71c1c;';
      }

      html += `
          <tr style="background-color: #f5f5f5;">
            <td colspan="7" style="text-align:right; font-weight:bold;">TOTAL KESELURUHAN POIN :</td>
            <td style="text-align:center; font-weight:bold; ${netColor}">${netDisplay}</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>`;
      html += ttdHtml;

    } else {
      // ============ FORMAT PER SISWA ============
      // Group by NIS
      const bySiswa = {};
      semua.forEach(item => {
        const key = item.nis;
        if (!bySiswa[key]) bySiswa[key] = { nis: item.nis, nama: item.nama, records: [] };
        bySiswa[key].records.push(item);
      });

      const siswaList = Object.values(bySiswa).sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
      let isFirst = true;

      siswaList.forEach((siswa) => {
        if (!isFirst) html += '<div style="page-break-before: always;"></div>';
        isFirst = false;

        html += KOP_SURAT_LAPORAN;

        const totalPoinPositif = siswa.records.filter(r => r.tipe === 'POSITIF').reduce((s, r) => s + (r.poin || 0), 0);
        const totalPoinNegatif = siswa.records.filter(r => r.tipe === 'NEGATIF').reduce((s, r) => s + (r.poin || 0), 0);

        html += `
          <h3>Laporan Sikap — ${siswa.nama} (${siswa.nis})</h3>
          <div style="margin-bottom:10px; font-size:11px;">
            Kelas: <b>${kelas}</b> &nbsp;|&nbsp; Tahun: <b>${tahun}</b>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width:30px;">No</th>
                <th style="width:75px;">Tanggal</th>
                <th style="width:60px;">Tipe</th>
                <th style="width:110px;">Dimensi/Jenis</th>
                <th style="width:130px;">Elemen/Perilaku</th>
                <th style="width:30px;">Poin</th>
                <th>Catatan / Tindak Lanjut</th>
                <th style="width:90px;">Guru</th>
              </tr>
            </thead>
            <tbody>`;

        siswa.records.forEach((item, i) => {
          const tipeClass = item.tipe === 'POSITIF' ? 'positif' : 'negatif';
          html += `<tr>
            <td style="text-align:center;">${i + 1}</td>
            <td style="text-align:center;">${item.tanggal}</td>
            <td class="${tipeClass}" style="text-align:center;">${item.tipe}</td>
            <td>${item.kategori}</td>
            <td>${item.detail}</td>
            <td style="text-align:center;">${item.poin || 0}</td>
            <td>${item.keterangan}</td>
            <td>${item.guru}</td>
          </tr>`;
        });

        const netTotalSiswa = totalPoinPositif - totalPoinNegatif;
        let netColorSiswa = '';
        let netDisplaySiswa = netTotalSiswa;
        if (netTotalSiswa > 0) {
          netColorSiswa = 'color:#2e7d32;';
          netDisplaySiswa = '+' + netTotalSiswa;
        } else if (netTotalSiswa < 0) {
          netColorSiswa = 'color:#b71c1c;';
        }

        html += `
          <tr style="background-color: #f5f5f5;">
            <td colspan="5" style="text-align:right; font-weight:bold;">TOTAL KESELURUHAN POIN :</td>
            <td style="text-align:center; font-weight:bold; ${netColorSiswa}">${netDisplaySiswa}</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>`;
        html += ttdHtml;
      });
    }

    html += `</body></html>`;

    if (btn) { btn.disabled = false; btn.innerHTML = '📥 DOWNLOAD PDF'; }
    openReportAndPrint(html);

  } catch (err) {
    if (btn) { btn.disabled = false; btn.innerHTML = '📥 DOWNLOAD PDF'; }
    showError('Gagal membuat laporan sikap: ' + err.message);
  }
}
