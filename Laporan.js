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
      siswaData.sort((a,b) => a.nama.localeCompare(b.nama));
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
      const [d1,m1,y1] = a.split('/');
      const [d2,m2,y2] = b.split('/');
      return new Date(y1,m1-1,d1) - new Date(y2,m2-1,d2);
    });

    const monthsMap = {};
    tanggalList.forEach(tgl => {
      const [dd, mm, yyyy] = tgl.split('/');
      const key = bulan === 'ALL' ? `${yyyy}-${mm}` : 'current';
      if (!monthsMap[key]) monthsMap[key] = { mm: parseInt(mm, 10), yyyy: parseInt(yyyy, 10), dates: [] };
      monthsMap[key].dates.push(tgl);
    });
    
    const sortedMonths = Object.values(monthsMap).sort((a,b) => {
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
          const [dd,mm,yyyy] = tgl.split('/');
          const tglObj = new Date(yyyy, mm-1, dd);
          const hari = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][tglObj.getDay()];
          headerKolom += `<th>${hari}<br>${dd}/${mm}</th>`;
        });

        const mNama = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][mObj.mm-1];
        
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
            
          let h=0, a=0, i=0, sakit=0, c=0, t=0;
          
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
            <p>Silayang, ${new Date().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'})}</p>
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
      siswaData.sort((a,b) => a.nama.localeCompare(b.nama));
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

    // 2. Ambil absensi bulanan untuk kelas ini (seluruh guru/mapel)
    let { data: absenData, error: errAbsen } = await supaClient.from('absensi')
      .select('*')
      .eq('kelas', kelas);

    if (errAbsen) throw errAbsen;
    
    // Group statusHarian by month
    const monthsMap = {}; // key: YYYY-MM
    
    if (absenData) {
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
              statusHarian: {}
            };
          }
          
          if (!monthsMap[key].statusHarian[nis]) monthsMap[key].statusHarian[nis] = {};
          
          const tglStr = row.tanggal;
          const statusLama = monthsMap[key].statusHarian[nis][tglStr];
          
          // Simpan hanya jika status baru lebih buruk
          if (!statusLama || getPrioritasStatus(status) > getPrioritasStatus(statusLama)) {
            monthsMap[key].statusHarian[nis][tglStr] = status;
          }
        }
      });
    }

    const sortedMonths = Object.values(monthsMap).sort((a,b) => {
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
    `;

    if (sortedMonths.length === 0) {
      html += `<div style="text-align:center; margin-top:50px; font-size:16px;">Belum ada data absensi untuk periode ini.</div></body></html>`;
    } else {
      sortedMonths.forEach((mObj, index) => {
        const mNama = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][mObj.mm-1];
        
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
    showError('Gagal membuat rekap bulanan: ' + error.message);
  }
}
