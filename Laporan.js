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
    const tableNameSiswa = isMC ? 'mapel_moving_siswa' : 'data_siswa';

    // 1. Ambil data siswa
    let { data: siswaData, error: errSiswa } = await supaClient
      .from(tableNameSiswa)
      .select('nis, nama')
      .eq('kelas', kelas)
      .order('nama', { ascending: true });

    if (errSiswa) throw errSiswa;
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
      const [d1,m1,y1] = a.split('/');
      const [d2,m2,y2] = b.split('/');
      return new Date(y1,m1-1,d1) - new Date(y2,m2-1,d2);
    });

    // 3. Bangun HTML
    const namaGuru = App.user.nama || App.user.username;
    const nipGuru = App.user.profil?.nip || '-';
    
    let headerKolom = '';
    tanggalList.forEach(tgl => {
      const [dd,mm,yyyy] = tgl.split('/');
      const tglObj = new Date(yyyy, mm-1, dd);
      const hari = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][tglObj.getDay()];
      headerKolom += `<th>${hari}<br>${dd}/${mm}</th>`;
    });

    const mNama = bulan === 'ALL' ? 'Semua Bulan' : ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][bulanNum-1];

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
          <span class="label">Bulan/Tahun</span><span class="value">: ${mNama} ${tahunNum}</span>
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th rowspan="2" style="width:30px;">NO</th>
            <th rowspan="2" style="width:50px;">NIS</th>
            <th rowspan="2" style="width:200px;">NAMA SISWA</th>
            ${tanggalList.length > 0 ? `<th colspan="${tanggalList.length}">TANGGAL PERTEMUAN</th>` : '<th>TANGGAL (Belum ada data)</th>'}
            <th colspan="6">TOTAL</th>
          </tr>
          <tr>
            ${headerKolom}
            <th class="rekap-col" style="width:25px;" title="Hadir">H</th>
            <th class="rekap-col" style="width:25px;" title="Sakit">S</th>
            <th class="rekap-col" style="width:25px;" title="Izin">I</th>
            <th class="rekap-col" style="width:25px;" title="Alpha">A</th>
            <th class="rekap-col" style="width:25px;" title="Cabut">C</th>
            <th class="rekap-col" style="width:25px;" title="Terlambat">T</th>
          </tr>
        </thead>
        <tbody>
    `;

    siswaData.forEach((s, idx) => {
      html += `<tr>
        <td>${idx + 1}</td>
        <td>${s.nis}</td>
        <td style="text-align:left;">${s.nama}</td>`;
        
      let h=0, a=0, i=0, sakit=0, c=0, t=0;
      
      if (tanggalList.length === 0) {
        html += `<td>-</td>`;
      } else {
        tanggalList.forEach(tgl => {
          let status = dataPerTanggal[tgl]?.[s.nis];
          if (!status) status = 'H'; // Default Hadir
          
          if (status === 'H') h++;
          else if (status === 'A') a++;
          else if (status === 'I') i++;
          else if (status === 'S') sakit++;
          else if (status === 'C') c++;
          else if (status === 'T') t++;
          
          let color = '';
          if (status === 'A') color = 'color:red; font-weight:bold;';
          else if (status === 'S' || status === 'I') color = 'color:orange; font-weight:bold;';
          else if (status === 'C') color = 'color:purple; font-weight:bold;';
          else if (status === 'T') color = 'color:blue; font-weight:bold;';
          
          html += `<td style="${color}">${status !== 'H' ? status : '.'}</td>`;
        });
      }
      
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
        <p>Silayang, ${new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p>
        <p>Guru Mata Pelajaran,</p>
        <div>
          <b><u>${namaGuru}</u></b><br>
          NIP. ${nipGuru}
        </div>
      </div>
    </body>
    </html>
    `;

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
    const tableNameSiswa = isMC ? 'mapel_moving_siswa' : 'data_siswa';

    // 1. Ambil data siswa
    let { data: siswaData, error: errSiswa } = await supaClient
      .from(tableNameSiswa)
      .select('nis, nama')
      .eq('kelas', kelas)
      .order('nama', { ascending: true });

    if (errSiswa) throw errSiswa;
    if (!siswaData || siswaData.length === 0) {
      throw new Error('Tidak ada data siswa di kelas ' + kelas);
    }

    const rekap = {};
    siswaData.forEach(s => {
      rekap[s.nis] = { nama: s.nama, H: 0, A: 0, I: 0, S: 0, C: 0, T: 0 };
    });

    // 2. Ambil absensi bulanan untuk kelas ini (seluruh guru/mapel)
    let { data: absenData, error: errAbsen } = await supaClient.from('absensi')
      .select('*')
      .eq('kelas', kelas);

    if (errAbsen) throw errAbsen;

    const bulanNum = parseInt(bulan);
    const tahunNum = parseInt(tahun);
    const statusHarian = {}; // statusHarian[nis][tglStr] = worst_status

    if (absenData) {
      absenData.forEach(row => {
        const [yyyy, mm, dd] = row.tanggal.split('-');
        const thn = parseInt(yyyy, 10);
        const bln = parseInt(mm, 10);
        const nis = row.nis;
        const status = row.status;

        // Skip jika nis tidak terdaftar di kelas ini
        if (!rekap[nis]) return;
        
        if (thn === tahunNum && bln === bulanNum) {
          const tglStr = row.tanggal; // YYYY-MM-DD
          
          if (!statusHarian[nis]) statusHarian[nis] = {};
          const statusLama = statusHarian[nis][tglStr];
          
          // Simpan hanya jika status baru lebih buruk
          if (!statusLama || getPrioritasStatus(status) > getPrioritasStatus(statusLama)) {
            statusHarian[nis][tglStr] = status;
          }
        }
      });
    }

    // 3. Hitung rekap harian ke dalam total bulanan
    for (const nis in statusHarian) {
      for (const tglStr in statusHarian[nis]) {
        const status = statusHarian[nis][tglStr];
        if (status === 'H') rekap[nis].H++;
        else if (status === 'A') rekap[nis].A++;
        else if (status === 'I') rekap[nis].I++;
        else if (status === 'S') rekap[nis].S++;
        else if (status === 'C') rekap[nis].C++;
        else if (status === 'T') rekap[nis].T++;
      }
    }

    // Ubah jadi array
    const rekapArray = siswaData.map(s => ({
      nis: s.nis,
      nama: s.nama,
      H: rekap[s.nis].H,
      S: rekap[s.nis].S,
      I: rekap[s.nis].I,
      A: rekap[s.nis].A,
      C: rekap[s.nis].C,
      T: rekap[s.nis].T,
    }));

    // Ambil data Wali Kelas
    let namaWali = '(Kosong / Tidak Ditemukan)';
    let nipWali = '-';
    let { data: guruData } = await supaClient.from('data_guru').select('nama, nip').eq('wali_kelas', kelas).limit(1);
    if (guruData && guruData.length > 0) {
      namaWali = guruData[0].nama;
      nipWali = guruData[0].nip || '-';
    }

    const mNama = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][bulanNum-1];

    // 4. Bangun HTML
    let html = `
    <html>
    <head>
      <style>
        @page { size: A4 portrait; margin: 1.5cm; }
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
        .ttd { margin-top: 50px; display: flex; justify-content: space-between; }
        .ttd div { text-align: center; width: 45%; }
        .ttd .sign-space { margin-top: 80px; font-weight: bold; text-decoration: underline; }
        .rekap-col { background: #e8f5e9 !important; font-weight: bold; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: black !important; }
      </style>
    </head>
    <body>
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
          <span class="label">Bulan/Tahun</span><span class="value">: ${mNama} ${tahunNum}</span>
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
            <th class="rekap-col" style="width:40px;" title="Hadir">H</th>
            <th class="rekap-col" style="width:40px;" title="Sakit">S</th>
            <th class="rekap-col" style="width:40px;" title="Izin">I</th>
            <th class="rekap-col" style="width:40px;" title="Alpha">A</th>
            <th class="rekap-col" style="width:40px;" title="Cabut">C</th>
            <th class="rekap-col" style="width:40px;" title="Terlambat">T</th>
          </tr>
        </thead>
        <tbody>
    `;

    rekapArray.forEach((r, idx) => {
      html += `<tr>
        <td>${idx + 1}</td>
        <td>${r.nis}</td>
        <td style="text-align:left;">${r.nama}</td>
        <td class="rekap-col" style="font-weight:bold;">${r.H}</td>
        <td class="rekap-col" style="${r.S > 0 ? 'color:orange;' : ''}">${r.S}</td>
        <td class="rekap-col" style="${r.I > 0 ? 'color:orange;' : ''}">${r.I}</td>
        <td class="rekap-col" style="${r.A > 0 ? 'color:red;' : ''}">${r.A}</td>
        <td class="rekap-col" style="${r.C > 0 ? 'color:purple;' : ''}">${r.C}</td>
        <td class="rekap-col" style="${r.T > 0 ? 'color:blue;' : ''}">${r.T}</td>
      </tr>`;
    });

    html += `
        </tbody>
      </table>
      
      <div class="ttd">
        <div>
          <p>Mengetahui,</p>
          <p>Kepala Sekolah</p>
          <div class="sign-space">Nurmali, S.Pd.</div>
          <p>NIP. 197410042006041003</p>
        </div>
        <div>
          <p>Silayang, ${new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p>
          <p>Wali Kelas</p>
          <div class="sign-space">${namaWali}</div>
          <p>NIP. ${nipWali}</p>
        </div>
      </div>
    </body>
    </html>
    `;

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
