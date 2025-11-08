// ==========================================================
// KONFIG FIREBASE
// ==========================================================
const firebaseConfig = {
  apiKey: "AIzaSyB6r-4Eh6yez0-nPiDeRb64bVa1vGRrRGs",
  databaseURL: "https://cameracctv-98b79-default-rtdb.firebaseio.com",
  projectId: "cameracctv-98b79",
};
const app = firebase.initializeApp(firebaseConfig);
const database = app.database();

let loggedInUsername = null;

// ==========================================================
// FUNGSI UTAMA (ROUTER)
// ==========================================================

/**
 * Fungsi "Otak" yang baru.
 * Dipanggil setiap kali halaman dimuat atau URL hash berubah.
 * Memutuskan bagian mana (section) yang harus tampil berdasarkan status login dan hash.
 */
function handleRouteChange() {
  const hash = window.location.hash || "#login"; // Ambil hash, default ke #login
  const isLoggedIn = loggedInUsername !== null;

  // 1. Perbarui UI Header (Tombol Login/Logout & Tampilkan/Sembunyikan Nav)
  // Ini dipanggil setiap saat agar UI selalu konsisten
  updateAuthUI(isLoggedIn, loggedInUsername);

  if (isLoggedIn) {
    // --- PENGGUNA SUDAH LOGIN ---
    if (hash === "#login") {
      // Jika sudah login tapi mencoba ke #login, paksa ke #control
      window.location.hash = "#control"; // Ini akan memicu handleRouteChange() lagi
      return;
    }

    // Tampilkan section berdasarkan hash (misal: #profile -> "profile-section")
    let pageId = hash.substring(1) + "-section";

    // Pastikan section-nya valid, jika tidak, ke default (#control)
    if (!document.getElementById(pageId)) {
      pageId = "control-section";
      window.location.hash = "control"; // Perbaiki URL jika hash tidak valid
    }

    // Tampilkan konten yang diminta
    showSection(pageId);
  } else {
    // --- PENGGUNA BELUM LOGIN ---
    // Paksa tampilkan "login-section", APAPUN hash-nya
    showSection("login-section");

    // Dan pastikan URL-nya bersih (hanya #login)
    if (hash !== "#login") {
      window.location.hash = "#login";
    }

    // Matikan semua listener Firebase jika user logout / di-force ke login
    // Ini penting untuk efisiensi dan menghindari error
    detachAllListeners();
  }
}

/**
 * FUNGSI BARU: Untuk mematikan semua listener Firebase.
 * Dipanggil saat user logout atau dipaksa ke halaman login.
 */
function detachAllListeners() {
  if (isControlListenersSetup) {
    database.ref(RTDB_STATUS_PATH + "/status_camera").off();
    database.ref(RTDB_STATUS_PATH + "/status_solenoid").off();
    isControlListenersSetup = false;
  }
  if (historyListenerAttached) {
    database.ref("camera/history").off();
    historyListenerAttached = false;
  }
  const nfcListContainer = document.getElementById("nfc-list-container");
  if (nfcListContainer && nfcListContainer.dataset.listenerAttached === "true") {
    database.ref(NFC_USERS_PATH).off();
    nfcListContainer.dataset.listenerAttached = "false";
  }
}

// ==========================================================
// FUNGSI UTILITY (YANG DIPERBARUI)
// ==========================================================

/**
 * (Disederhanakan)
 * HANYA mengurus tampilan KONTEN UTAMA dan memuat data yang relevan.
 */
function showSection(sectionId) {
  // 1. Sembunyikan semua konten
  document.querySelectorAll(".content-section").forEach((section) => (section.style.display = "none"));

  // 2. Tampilkan yang kita inginkan
  const el = document.getElementById(sectionId);
  if (el) el.style.display = "block";

  // 3. Perbarui 'active' class di navigasi
  document.querySelectorAll("#auth-nav-links .nav-link").forEach((link) => {
    link.classList.remove("active");
    // Gunakan data-page yang kita set di HTML
    if (link.dataset.page === sectionId) {
      link.classList.add("active");
    }
  });

  // 4. Muat data jika perlu (logic ini tetap sama)
  if (sectionId === "gallery-section" && !historyListenerAttached) {
    loadGallery();
  }
  if (sectionId === "control-section" && !isControlListenersSetup) {
    setupControlListeners();
    loadNFCCards();
  }
  // (Perhatikan: Saya menambahkan '&& !listenerAttached' agar tidak memuat ulang data jika sudah ada)
}

/**
 * (Disederhanakan)
 * HANYA mengurus tampilan HEADER/NAVBAR (Tombol Login/Logout).
 */
function updateAuthUI(isLoggedIn, username = "") {
  const authButton = document.getElementById("auth-button");
  const navLinks = document.getElementById("auth-nav-links");

  if (isLoggedIn) {
    authButton.textContent = "Logout (" + username + ")";
    authButton.classList.remove("btn-primary", "btn-warning");
    authButton.classList.add("btn-danger");
    navLinks.style.display = "flex";
  } else {
    authButton.textContent = "Login";
    authButton.classList.remove("btn-danger");
    authButton.classList.add("btn-warning");
    navLinks.style.display = "none";
  }
}

/**
 * (Diperbarui)
 * Cek session di localStorage.
 * Fungsi ini TIDAK lagi memanggil updateAuthUI.
 * Fungsi ini HANYA mengatur global state 'loggedInUsername'.
 */
function checkSession() {
  const storedUsername = localStorage.getItem("sessionUser");
  const storedTimestamp = localStorage.getItem("sessionTimestamp");

  if (!storedUsername || !storedTimestamp) {
    loggedInUsername = null; // Pastikan state jelas
    return; // Selesai, 'handleRouteChange' akan menangani sisanya
  }

  const fiveMinutes = 5 * 60 * 1000;
  const now = new Date().getTime();
  const timeElapsed = now - parseInt(storedTimestamp, 10);

  if (timeElapsed < fiveMinutes) {
    // BELUM 5 MENIT: Anggap masih login
    loggedInUsername = storedUsername; // <-- PENTING: Set global state
  } else {
    // SUDAH 5 MENIT: Anggap sudah logout
    localStorage.removeItem("sessionUser");
    localStorage.removeItem("sessionTimestamp");
    loggedInUsername = null; // <-- PENTING: Clear global state
  }
}

// ==========================================================
// FUNGSI AUTH (YANG DIPERBARUI)
// ==========================================================

/**
 * (Diperbarui)
 * Saat logout, HANYA clear state dan ubah hash.
 * Router akan menangani perubahan UI.
 */
function handleAuth() {
  if (loggedInUsername) {
    // --- Log Out ---
    localStorage.removeItem("sessionUser");
    localStorage.removeItem("sessionTimestamp");
    loggedInUsername = null; // Clear global state

    // JANGAN panggil updateAuthUI() atau showSection()
    // Cukup ubah hash. Router akan menangani sisanya.
    window.location.hash = "#login";
  } else {
    // --- Tombol Login diklik ---
    // (Seharusnya user sudah di #login, tapi untuk keamanan)
    window.location.hash = "#login";
  }
}

/**
 * (Diperbarui)
 * Saat login sukses, HANYA set state dan ubah hash.
 * Router akan menangani perubahan UI.
 */
function login() {
  const usernameInput = document.getElementById("username").value.trim();
  const passwordInput = document.getElementById("password").value;
  const errorElement = document.getElementById("auth-error");
  errorElement.textContent = "Validasi...";

  database
    .ref("web_users/" + usernameInput)
    .once("value")
    .then((snapshot) => {
      const userData = snapshot.val();
      if (userData && userData.password === passwordInput) {
        // --- Login Sukses ---
        const now = new Date().getTime();
        localStorage.setItem("sessionUser", usernameInput);
        localStorage.setItem("sessionTimestamp", now);

        loggedInUsername = usernameInput; // Set global state
        errorElement.textContent = "";
        document.getElementById("username").value = "";
        document.getElementById("password").value = "";

        // JANGAN panggil updateAuthUI() atau showSection()
        // Cukup ubah hash. Router akan menangani sisanya.
        window.location.hash = "#control";
      } else {
        // --- Login Gagal ---
        errorElement.textContent = "Username atau Password salah. Silakan coba lagi.";
        loggedInUsername = null;
        localStorage.removeItem("sessionUser");
        localStorage.removeItem("sessionTimestamp");
      }
    })
    .catch((error) => {
      console.error("FIREBASE CONNECTION ERROR:", error);
      errorElement.textContent = "Error Koneksi ke Database. Cek Rules atau Jaringan.";
    });
}

// ==========================================================
// FUNGSI LAIN (TIDAK BERUBAH)
// (Termasuk updateTime, executePasswordChange, loadGallery,
// deleteGalleryNode, toggleCamera, toggleSolenoid,
// setupControlListeners, addNFCCard, deleteNFCCard, loadNFCCards)
// ==========================================================

function updateTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateString = now.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  document.getElementById("current-time").textContent = `${timeString} - ${dateString}`;
}

function executePasswordChange() {
  const username = document.getElementById("modalUsername").value.trim();
  const currentPassword = document.getElementById("modalCurrentPassword").value;
  const newPassword = document.getElementById("modalNewPassword").value;
  const messageElement = document.getElementById("modal-password-message");
  messageElement.textContent = "Memproses...";

  if (!username || !currentPassword || newPassword.length < 6) {
    messageElement.textContent = "Semua field harus diisi, dan password baru minimal 6 karakter.";
    messageElement.style.color = "var(--danger-color)";
    return;
  }

  database
    .ref("web_users/" + username)
    .once("value")
    .then((snapshot) => {
      const userData = snapshot.val();
      if (!userData) {
        messageElement.textContent = "Username tidak ditemukan.";
        messageElement.style.color = "var(--danger-color)";
      } else if (userData.password === currentPassword) {
        database
          .ref("web_users/" + username + "/password")
          .set(newPassword)
          .then(() => {
            messageElement.textContent = "Password berhasil diperbarui! ✅ Anda bisa login sekarang.";
            messageElement.style.color = "var(--success-color)";
            document.getElementById("modalCurrentPassword").value = "";
            document.getElementById("modalNewPassword").value = "";
          })
          .catch((error) => {
            messageElement.textContent = `Gagal menyimpan password baru: ${error.message}`;
            messageElement.style.color = "var(--danger-color)";
          });
      } else {
        messageElement.textContent = "Password lama salah untuk username ini.";
        messageElement.style.color = "var(--danger-color)";
      }
    })
    .catch((error) => {
      messageElement.textContent = `Error saat validasi: ${error.message}`;
      messageElement.style.color = "var(--danger-color)";
    });
}

// --- GALERI ---
let historyListenerAttached = false;
function loadGallery() {
  if (historyListenerAttached) return; // Sudah terpasang, jangan duplikat

  const historyRef = database.ref("camera/history");
  const container = document.getElementById("history-container");
  const statusEl = document.querySelector("#gallery-section .status");
  container.innerHTML = "";
  statusEl.textContent = "Memuat data dari Firebase...";

  historyRef.limitToLast(50).on(
    "value",
    (snapshot) => {
      const historyData = snapshot.val();
      container.innerHTML = "";

      if (!historyData) {
        statusEl.textContent = "Galeri kosong. Belum ada data gambar dari ESP32.";
        return;
      }
      const entries = Object.entries(historyData).reverse();

      entries.forEach(([nodeId, data]) => {
        const base64Data = data.image_data;
        const timestamp = data.timestamp;
        const uid = data.uid || "N/A";
        const name = data.name || "Unknown User";
        const accessStatus = data.access || "LOG";
        if (!base64Data) return;
        const dt = new Date(timestamp || Date.now());
        const datePart = dt.toLocaleDateString("id-ID");
        const timePart = dt.toLocaleTimeString("id-ID");
        const itemDiv = document.createElement("div");
        itemDiv.className = "imageItem";
        let borderColor = "lightgray";
        if (accessStatus === "GRANTED") borderColor = "var(--success-color)";
        else if (accessStatus === "DENIED") borderColor = "var(--danger-color)";
        itemDiv.style.border = `2px solid ${borderColor}`;
        const imgElement = document.createElement("img");
        imgElement.src = base64Data;
        imgElement.className = "historyImage";
        imgElement.alt = `Foto ${name} - ${datePart} ${timePart}`;
        const trashBtn = document.createElement("button");
        trashBtn.className = "trash-btn";
        trashBtn.title = "Hapus foto";
        trashBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        trashBtn.onclick = (e) => {
          e.stopPropagation();
          if (!confirm("Hapus foto ini dari galeri?")) return;
          deleteGalleryNode(nodeId, itemDiv);
        };
        const infoDiv = document.createElement("div");
        infoDiv.className = "image-info";
        const nameInfo = document.createElement("p");
        nameInfo.innerHTML = `<strong>👤 Nama:</strong> <span style="color: ${accessStatus === "DENIED" ? "var(--danger-color)" : "var(--untirta-blue)"}">${name} (${accessStatus})</span>`;
        const uidInfo = document.createElement("p");
        uidInfo.innerHTML = `<strong>🆔 UID:</strong> ${uid}`;
        const dateInfo = document.createElement("p");
        dateInfo.innerHTML = `<strong>📅 Tanggal:</strong> ${datePart}`;
        const timeInfo = document.createElement("p");
        timeInfo.innerHTML = `<strong>⏱️ Jam:</strong> ${timePart}`;
        infoDiv.appendChild(nameInfo);
        infoDiv.appendChild(uidInfo);
        infoDiv.appendChild(dateInfo);
        infoDiv.appendChild(timeInfo);
        itemDiv.appendChild(trashBtn);
        itemDiv.appendChild(imgElement);
        itemDiv.appendChild(infoDiv);
        container.appendChild(itemDiv);
      });
      statusEl.textContent = `Berhasil memuat ${entries.length} log terakhir.`;
    },
    (error) => {
      console.error("Firebase read failed: ", error);
      statusEl.textContent = "ERROR: Gagal memuat galeri dari Firebase.";
    }
  );
  historyListenerAttached = true;
}

function deleteGalleryNode(nodeId, domElement) {
  database
    .ref("camera/history/" + nodeId)
    .remove()
    .then(() => {
      if (domElement && domElement.parentNode) domElement.parentNode.removeChild(domElement);
      const statusEl = document.querySelector("#gallery-section .status");
      if (statusEl) {
        statusEl.textContent = "Foto berhasil dihapus.";
        setTimeout(() => (statusEl.textContent = ""), 2500);
      }
    })
    .catch((error) => {
      console.error("Gagal hapus foto:", error);
      alert("Gagal menghapus foto: " + error.message);
    });
}

// --- CONTROL ---
const RTDB_CONTROL_PATH = "control_state";
const RTDB_STATUS_PATH = "status_output";
let isControlListenersSetup = false;

window.toggleCamera = function (isChecked) {
  const status = isChecked ? "ON" : "OFF";
  database
    .ref(RTDB_CONTROL_PATH + "/camera_status")
    .set(status)
    .catch((error) => console.error("Error setting camera control status:", error));
};

window.toggleSolenoid = function (isChecked) {
  const status = isChecked ? "CLOSE" : "OPEN";
  database
    .ref(RTDB_CONTROL_PATH + "/solenoid_status")
    .set(status)
    .catch((error) => console.error("Error setting solenoid control status:", error));
};

function setupControlListeners() {
  if (isControlListenersSetup) return; // Sudah terpasang, jangan duplikat

  database.ref(RTDB_STATUS_PATH + "/status_camera").on("value", (snapshot) => {
    const status = snapshot.val();
    const label = document.getElementById("camera-status-label");
    const toggle = document.getElementById("cameraToggle");
    if (status === "ON") {
      label.textContent = "OTOMATIS AKTIF";
      label.className = "badge badge-status bg-success";
      toggle.checked = true;
    } else if (status === "OFF") {
      label.textContent = "MANUAL / MATI";
      label.className = "badge badge-status bg-danger";
      toggle.checked = false;
    } else {
      label.textContent = "LOADING";
      label.className = "badge badge-status bg-secondary";
    }
  });

  database.ref(RTDB_STATUS_PATH + "/status_solenoid").on("value", (snapshot) => {
    const status = snapshot.val();
    const label = document.getElementById("solenoid-status-label");
    const toggle = document.getElementById("solenoidToggle");
    if (status === "CLOSE") {
      label.textContent = "TERKUNCI (AMAN)";
      label.className = "badge badge-status bg-success";
      toggle.checked = true;
    } else if (status === "OPEN") {
      label.textContent = "TERBUKA (BAHAYA)";
      label.className = "badge badge-status bg-danger";
      toggle.checked = false;
    } else {
      label.textContent = "LOADING";
      label.className = "badge badge-status bg-secondary";
    }
  });
  isControlListenersSetup = true;
}

// --- NFC ---
const NFC_USERS_PATH = "nfc_users";

window.addNFCCard = function () {
  const name = document.getElementById("nfcName").value.trim();
  let uid = document.getElementById("nfcUID").value.trim().toUpperCase();
  const messageElement = document.getElementById("nfc-message");
  messageElement.textContent = "Memproses...";
  messageElement.style.color = "inherit";
  uid = uid.replace(/[^0-9A-F]/g, "");
  if (!name || uid.length === 0) {
    messageElement.textContent = "Nama dan UID Kartu wajib diisi.";
    messageElement.style.color = "var(--danger-color)";
    return;
  }
  database
    .ref(NFC_USERS_PATH + "/" + uid)
    .set({
      name: name,
      registered_by: loggedInUsername,
      registered_at: new Date().toISOString(),
    })
    .then(() => {
      messageElement.textContent = `Kartu ${name} (UID: ${uid}) berhasil didaftarkan! ✅`;
      messageElement.style.color = "var(--success-color)";
      document.getElementById("nfcName").value = "";
      document.getElementById("nfcUID").value = "";
    })
    .catch((error) => {
      messageElement.textContent = `Gagal menyimpan data: ${error.message}`;
      messageElement.style.color = "var(--danger-color)";
    });
};

window.deleteNFCCard = function (uid, name) {
  if (confirm(`Apakah Anda yakin ingin menghapus kartu akses milik ${name} (UID: ${uid})?`)) {
    database
      .ref(NFC_USERS_PATH + "/" + uid)
      .remove()
      .then(() => {
        const messageElement = document.getElementById("nfc-message");
        messageElement.textContent = `Kartu ${name} berhasil dihapus. 🗑️`;
        messageElement.style.color = "var(--warning-color)";
      })
      .catch((error) => {
        console.error(`Gagal menghapus data: ${error.message}`);
        const messageElement = document.getElementById("nfc-message");
        messageElement.textContent = `Gagal menghapus data: ${error.message}`;
        messageElement.style.color = "var(--danger-color)";
      });
  }
};

/**
 * [FUNGSI BARU] Membuka modal edit dan mengisinya dengan data
 */
function openEditNFCModal(uid, currentName) {
  // Isi field di modal
  document.getElementById("modalNFC_UID").value = uid;
  document.getElementById("modalNFC_Name").value = currentName;

  // Bersihkan pesan error/sukses sebelumnya
  document.getElementById("modal-nfc-message").textContent = "";

  // Tampilkan modal
  var myModal = new bootstrap.Modal(document.getElementById("editNFCModal"));
  myModal.show();
}

/**
 * [FUNGSI BARU] Menyimpan perubahan nama dari modal
 */
function executeUpdateNFC() {
  const uid = document.getElementById("modalNFC_UID").value;
  const newName = document.getElementById("modalNFC_Name").value.trim();
  const messageElement = document.getElementById("modal-nfc-message");
  const saveBtn = document.getElementById("modal-nfc-save-btn");

  if (!newName) {
    messageElement.textContent = "Nama baru tidak boleh kosong.";
    messageElement.style.color = "var(--danger-color)";
    return;
  }

  // Nonaktifkan tombol agar tidak diklik dua kali
  saveBtn.disabled = true;
  saveBtn.textContent = "Menyimpan...";
  messageElement.textContent = "Memproses...";
  messageElement.style.color = "inherit";

  // Kita gunakan .update() untuk hanya mengubah 'name'
  // dan membiarkan 'registered_by' / 'registered_at' tetap ada.
  database
    .ref(NFC_USERS_PATH + "/" + uid)
    .update({ name: newName }) // Hanya update field 'name'
    .then(() => {
      messageElement.textContent = "Nama berhasil diperbarui! ✅";
      messageElement.style.color = "var(--success-color)";

      // Tutup modal setelah 1.5 detik
      setTimeout(() => {
        var myModal = bootstrap.Modal.getInstance(document.getElementById("editNFCModal"));
        myModal.hide();
      }, 1500);
    })
    .catch((error) => {
      messageElement.textContent = `Gagal menyimpan: ${error.message}`;
      messageElement.style.color = "var(--danger-color)";
    })
    .finally(() => {
      // Aktifkan kembali tombol
      saveBtn.disabled = false;
      saveBtn.textContent = "Simpan Perubahan";
    });
}

function loadNFCCards() {
  const listContainer = document.getElementById("nfc-list-container");
  if (listContainer.dataset.listenerAttached === "true") return; // Sudah terpasang, jangan duplikat

  listContainer.innerHTML = '<p class="text-center text-muted">Memuat daftar kartu...</p>';
  database.ref(NFC_USERS_PATH).on("value", (snapshot) => {
    const usersData = snapshot.val();
    listContainer.innerHTML = "";
    if (!usersData) {
      listContainer.innerHTML = '<p class="text-center text-muted">Belum ada kartu terdaftar.</p>';
      return;
    }
    const cardUids = Object.keys(usersData).sort();
    cardUids.forEach((uid) => {
      const userData = usersData[uid];
      const item = document.createElement("div");
      item.className = "list-group-item d-flex justify-content-between align-items-center";
      item.style.backgroundColor = "#f1f8ff";
      item.style.borderRadius = "8px";
      item.style.marginBottom = "8px";
      item.innerHTML = `
                  <div>
                      <strong class="text-primary">${userData.name}</strong><br>
                      <small class="text-muted"><i class="fa-solid fa-tag me-1"></i> UID: ${uid}</small>
                  </div>
                  <div class="d-flex">
                      <button class="btn btn-sm btn-outline-primary me-2" onclick="openEditNFCModal('${uid}', '${userData.name}')">
                          <i class="fa-solid fa-pencil"></i> Edit
                      </button>
                      <button class="btn btn-sm btn-outline-danger" onclick="deleteNFCCard('${uid}', '${userData.name}')">
                          <i class="fa-solid fa-trash-alt"></i> Hapus
                      </button>
                  </div>
              `;
      listContainer.appendChild(item);
    });
  });
  listContainer.dataset.listenerAttached = "true";
}

// ==========================================================
// INIT (YANG DIPERBARUI)
// ==========================================================
document.addEventListener("DOMContentLoaded", () => {
  // 1. Jalankan jam
  setInterval(updateTime, 1000);
  updateTime();

  // 2. Pasang 'listener' untuk URL hash
  // Ini akan memanggil 'handleRouteChange' setiap kali user klik link (#profile, #gallery)
  // atau menggunakan tombol back/forward browser
  window.addEventListener("hashchange", handleRouteChange);

  // 3. Cek status login (dari localStorage)
  // Ini akan mengatur 'loggedInUsername'
  checkSession();

  // 4. Jalankan router untuk PERTAMA KALI
  // Ini akan membaca 'loggedInUsername' dan hash URL saat ini, lalu menampilkan halaman yang benar
  handleRouteChange();
});
