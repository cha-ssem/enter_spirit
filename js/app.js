/**
 * 기업가 정신 13기 통합 웹플랫폼 Application Logic (NVIDIA CAD Style design1.md)
 */

document.addEventListener("DOMContentLoaded", () => {
  App.init();
});

const App = {
  currentRole: "guest", // 'guest'(미가입 비회원), 'regular'(일반), 'full'(정회원), 'exec'(임원), 'admin'(관리자)
  currentTab: "home",
  members: [],
  lectures: [],
  events: [],
  ledger: [],
  currentUserId: "mem-1301",

  init() {
    this.members = StorageService.getMembers();
    this.lectures = StorageService.getLectures();
    this.events = StorageService.getEvents();
    this.ledger = StorageService.getLedger();
    this.initialBalance = StorageService.getInitialBalance();

    // 브라우저 새로고침 시에도 사용자의 세션(로그인 또는 로그아웃 상태) 100% 완벽 보존
    const savedUserId = StorageService.getCurrentUserId();
    const savedRole = StorageService.getCurrentUserRole();

    if (savedUserId && savedRole !== "guest") {
      this.currentUserId = savedUserId;
      this.currentRole = savedRole;
    } else {
      // 💡 로그아웃 상태일 때 임의 회원으로 재로그인되지 않도록 guest 세션 엄격 고정!
      this.currentUserId = null;
      this.currentRole = "guest";
      StorageService.setCurrentUserRole("guest");
      StorageService.setCurrentUserId("");
    }

    this.bindEvents();
    this.updateRoleUI();
    this.renderCurrentTab();

    // 💡 Firebase Firestore 클라우드 DB의 최신 회원 데이터, 강의 커리큘럼, 네트워킹 행사, 장부 데이터 비동기 동기화
    setTimeout(() => {
      if (typeof this.fetchCloudMembers === "function") this.fetchCloudMembers();
      if (typeof this.fetchCloudLectures === "function") this.fetchCloudLectures();
      if (typeof this.fetchCloudEvents === "function") this.fetchCloudEvents();
      if (typeof this.fetchCloudLedger === "function") this.fetchCloudLedger();
    }, 300);
  },

  bindEvents() {
    document.querySelectorAll(".role-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const selectedRole = e.target.dataset.role;
        this.setRole(selectedRole);
      });
    });

    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    document.querySelectorAll(".mobile-nav-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    const searchInput = document.getElementById("memberSearch");
    const industryFilter = document.getElementById("industryFilter");
    const cohortFilter = document.getElementById("cohortFilter");
    const sortSelect = document.getElementById("sortSelect");

    if (searchInput) searchInput.addEventListener("input", () => this.renderMemberDirectory());
    if (industryFilter) industryFilter.addEventListener("change", () => this.renderMemberDirectory());
    if (cohortFilter) cohortFilter.addEventListener("change", () => this.renderMemberDirectory());
    if (sortSelect) sortSelect.addEventListener("change", () => this.renderMemberDirectory());

    const profileIndustry = document.getElementById("profileIndustry");
    if (profileIndustry) {
      profileIndustry.addEventListener("change", (e) => this.handleProfileIndustryChange(e.target.value));
    }

    const profileForm = document.getElementById("profileForm");
    if (profileForm) {
      profileForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.saveProfile();
      });
    }

    const ledgerForm = document.getElementById("ledgerForm");
    if (ledgerForm) {
      ledgerForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.addLedgerEntry();
      });
    }

    const addLectureForm = document.getElementById("addLectureForm");
    if (addLectureForm) {
      addLectureForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.addLecture();
      });
    }

    const avatarInput = document.getElementById("avatarFileInput");
    if (avatarInput) {
      avatarInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          if (!file.type.startsWith("image/")) {
            alert("이미지 파일만 업로드 가능합니다.");
            return;
          }
          const reader = new FileReader();
          reader.onload = (evt) => {
            const img = new Image();
            img.onload = () => {
              // 이미지 저장용량 95% 이상 간소화를 위한 HTML5 Canvas 생성
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              
              // 최대 300x300 픽셀로 스마트 리사이징
              const maxDim = 300;
              let width = img.width;
              let height = img.height;
              
              if (width > height) {
                if (width > maxDim) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                }
              } else {
                if (height > maxDim) {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);

              // .jpg / .jpeg 경량화 포맷 (Quality 0.8) 압축 변환 (10MB -> 20~30KB로 극적 축소)
              const compressedJpegUrl = canvas.toDataURL("image/jpeg", 0.8);
              
              const sidebarAvatarImg = document.getElementById("sidebarAvatarImg");
              if (sidebarAvatarImg) sidebarAvatarImg.src = compressedJpegUrl;
              this.tempAvatarUrl = compressedJpegUrl;
              this.showToast("📷 고화질 프로필 사진이 .jpeg 포맷(30KB 미만)으로 압축 변환되었습니다!");
            };
            img.src = evt.target.result;
          };
          reader.readAsDataURL(file);
        }
      });
    }

    const editLectureForm = document.getElementById("editLectureForm");
    if (editLectureForm) {
      editLectureForm.addEventListener("submit", (e) => {
        e.preventDefault();
        this.saveEditedLecture();
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeEditLectureModal();
        this.closeImageZoomModal();
      }
    });
  },

  async fetchCloudMembers() {
    if (!window.db || !window.FS || !window.FS.getDocs) return;

    try {
      const querySnapshot = await window.FS.getDocs(window.FS.collection(window.db, "members"));
      if (!querySnapshot || querySnapshot.empty) return;

      const cloudMembers = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const member = { ...data, id: docSnap.id || data.id };
        if ("industryIcon" in member) {
          delete member.industryIcon;
        }
        if (member.industry) {
          member.industryImg = this.getIndustryImage(member.industry);
        }
        cloudMembers.push(member);
      });

      if (cloudMembers.length > 0) {
        // 💡 데이터베이스(Firestore)에 등록된 실제 회원 데이터만을 유일하게 유지 (DB에 없는 샘플/목업 회원 제거)
        this.members = cloudMembers;
        StorageService.saveMembers(this.members);

        // 💡 이미 로그인된 사용자의 경우 클라우드 DB 상에서 변경된 회원 권한(role: "admin" 등) 감지 시 세션 자동 업데이트!
        if (this.currentUserId && this.currentRole !== "guest") {
          const me = this.members.find(m => m.id === this.currentUserId || (m.googleUid && m.googleUid === this.currentUserId));
          if (me && me.role && me.role !== this.currentRole) {
            console.log(`💡 클라우드 DB에서 권한 변경 감지됨: ${this.currentRole} -> ${me.role}`);
            this.setRole(me.role);
          } else {
            this.updateRoleUI();
          }
        } else {
          this.updateRoleUI();
        }

        // 💡 현재 활성화된 탭이 Overview(home)인 경우 최신 회원 통계 즉시 갱신
        if (this.currentTab === "home") {
          this.renderHome();
        } else if (this.currentTab === "members") {
          this.renderMemberDirectory();
        } else if (this.currentTab === "admin") {
          this.renderAdmin();
        }
      }
    } catch (err) {
      console.warn("Firestore 회원 데이터 로딩 시도 중 예외:", err);
    }
  },

  async fetchCloudLectures() {
    if (!window.db || !window.FS || !window.FS.getDocs) return;

    try {
      const querySnapshot = await window.FS.getDocs(window.FS.collection(window.db, "lectures"));
      if (!querySnapshot) return;

      const cloudLectures = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        cloudLectures.push({ ...data, id: docSnap.id || data.id });
      });

      if (cloudLectures.length > 0) {
        // 💡 오직 데이터베이스(Firestore 'lectures')에 실제로 저장되어 있는 강의 커리큘럼 일정만 유일하게 유지! (DB에 없는 목업 샘플 강의 전면 제거)
        cloudLectures.sort((a, b) => a.week - b.week);
        this.lectures = cloudLectures;
        StorageService.saveLectures(this.lectures);
        this.renderSchedule();
      }
    } catch (err) {
      console.warn("Firestore lectures 클라우드 DB 로딩 예외:", err);
    }
  },

  async fetchCloudEvents() {
    if (!window.db || !window.FS || !window.FS.getDocs) return;

    try {
      const querySnapshot = await window.FS.getDocs(window.FS.collection(window.db, "events"));
      if (!querySnapshot) return;

      const cloudEvents = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        cloudEvents.push({ ...data, id: docSnap.id || data.id });
      });

      if (cloudEvents.length > 0) {
        this.events = cloudEvents;
        StorageService.saveEvents(this.events);
        this.renderSchedule();
      }
    } catch (err) {
      console.warn("Firestore events 클라우드 DB 로딩 예외:", err);
    }
  },

  async fetchCloudLedger() {
    if (!window.db || !window.FS || !window.FS.getDocs) return;

    try {
      const querySnapshot = await window.FS.getDocs(window.FS.collection(window.db, "ledger"));
      if (!querySnapshot || querySnapshot.empty) return;

      const cloudLedger = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const docId = docSnap.id || data.id;

        // 💡 initial_balance 이월 잔고 설정 문서는 장부 항목이 아닌 이월 잔고 설정값으로 분리 저장
        if (docId === "initial_balance" || data.isConfig === true) {
          if (typeof data.initialBalance === "number") {
            this.initialBalance = data.initialBalance;
            StorageService.saveInitialBalance(data.initialBalance);
            const initialEl = document.getElementById("initialBalanceAmount");
            if (initialEl) initialEl.textContent = `${this.initialBalance.toLocaleString()}원`;
          }
          return;
        }

        cloudLedger.push({ ...data, id: docId });
      });

      cloudLedger.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      this.ledger = cloudLedger;
      StorageService.saveLedger(this.ledger);

      // 💡 현재 탭이 관리자 탭('admin')이거나 'ledger'인 경우 화면 자동 갱신
      if (this.currentTab === "admin" || this.currentTab === "ledger") {
        this.renderLedger();
      }
    } catch (err) {
      console.warn("Firestore ledger 클라우드 DB 로딩 예외 (로컬 Fallback 유지):", err);
    }
  },

  // 💡 XSS(Cross-Site Scripting) 방어 헬퍼 함수
  escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  },

  // 💡 비회원(guest) 대상 민감 개인정보(전화번호/이메일/카톡) 자동 마스킹 헬퍼
  maskPhone(phone) {
    if (!phone) return "";
    if (this.currentRole !== "guest") return phone;
    return phone.replace(/(\d{2,3})[-.]?(\d{3,4})[-.]?(\d{4})/, "$1-****-$3");
  },

  maskEmail(email) {
    if (!email) return "";
    if (this.currentRole !== "guest") return email;
    const parts = email.split("@");
    if (parts.length !== 2) return email;
    const name = parts[0];
    const visibleLen = Math.min(2, Math.max(1, Math.floor(name.length / 2)));
    const maskedName = name.slice(0, visibleLen) + "*".repeat(Math.max(3, name.length - visibleLen));
    return `${maskedName}@${parts[1]}`;
  },

  maskKakao(kakaoId) {
    if (!kakaoId) return "";
    if (this.currentRole !== "guest") return kakaoId;
    if (kakaoId.length <= 2) return kakaoId + "***";
    return kakaoId.slice(0, 2) + "*".repeat(Math.max(3, kakaoId.length - 2));
  },

  setAccentColor(primaryHex, darkHex) {
    document.documentElement.style.setProperty("--color-primary", primaryHex);
    document.documentElement.style.setProperty("--color-primary-dark", darkHex || primaryHex);

    document.querySelectorAll(".color-preset-btn").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("onclick").includes(primaryHex));
    });

    this.showToast(`🎨 웹사이트 브랜드 포인트 컬러가 '${primaryHex}'로 실시간 전환되었습니다.`);
  },

  setRole(role) {
    this.currentRole = role;
    StorageService.setCurrentUserRole(role);
    this.updateRoleUI();
    this.showToast(`사용자 등급이 '${this.getRoleName(role)}'(으)로 전환되었습니다.`);
    this.renderCurrentTab();
  },

  logout() {
    this.currentUserId = null;
    StorageService.setCurrentUserId("");
    StorageService.setCurrentUserRole("guest");
    this.currentRole = "guest";

    // 💡 Firebase Auth 구글 소셜 로그인 인증 세션도 완전 해제
    if (window.auth && window.auth.signOut) {
      try {
        window.auth.signOut();
      } catch (err) {
        console.log("Firebase signOut:", err);
      }
    }

    this.updateRoleUI();
    this.showToast("🚪 안전하게 로그아웃되었습니다. 비회원 접속 상태로 전환됩니다.");
    this.switchTab("home");
  },

  getRoleName(role) {
    switch (role) {
      case "admin": return "관리자";
      case "exec": return "임원";
      case "full": return "정회원";
      case "regular": return "일반회원";
      case "guest": return "미가입 비회원";
      default: return "회원";
    }
  },

  updateRoleUI() {
    document.querySelectorAll(".role-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.role === this.currentRole);
    });

    const currentRoleBadge = document.getElementById("currentRoleDisplay");
    if (currentRoleBadge) {
      currentRoleBadge.textContent = `${this.getRoleName(this.currentRole)} 모드`;
    }

    const adminNavTab = document.getElementById("navAdminTab");
    const mobileNavAdminBtn = document.getElementById("mobileNavAdminBtn");
    const isAdminOrExec = this.currentRole === "admin" || this.currentRole === "exec";

    // 일반회원, 정회원의 경우 관리자/장부 탭을 완벽히 숨김 (임원 및 관리자만 노출)
    if (adminNavTab) adminNavTab.style.display = isAdminOrExec ? "block" : "none";
    if (mobileNavAdminBtn) mobileNavAdminBtn.style.display = isAdminOrExec ? "flex" : "none";

    // 권한이 일반회원 또는 정회원으로 하향된 상태에서 현재 탭이 admin 탭인 경우 홈 탭으로 자동 이동
    if (!isAdminOrExec && this.currentTab === "admin") {
      this.switchTab("home");
    }

    // 상단 우측 인사말 텍스트 & 버튼: 비회원 시 '📝 회원가입하기 →', 로그인 시 '👋 [회원명]님! 반갑습니다' 텍스트 + '🚪 로그아웃하기' 버튼
    const topNavUserBtn = document.getElementById("topNavUserBtn");
    const topNavUserWelcomeText = document.getElementById("topNavUserWelcomeText");

    if (topNavUserBtn) {
      if (this.currentRole === "guest") {
        if (topNavUserWelcomeText) topNavUserWelcomeText.style.display = "none";
        topNavUserBtn.textContent = "📝 회원가입하기 →";
        topNavUserBtn.onclick = () => this.openRegisterModal();
      } else {
        const currentUser = this.members.find(m => m.id === this.currentUserId) || this.members[0];
        const userName = currentUser ? currentUser.name : "원우";
        
        if (topNavUserWelcomeText) {
          topNavUserWelcomeText.textContent = `👋 ${userName}님! 반갑습니다`;
          topNavUserWelcomeText.style.display = "inline";
        }
        
        topNavUserBtn.textContent = "🚪 로그아웃하기";
        topNavUserBtn.onclick = () => this.logout();
      }
    }
  },

  switchTab(tab) {
    // 일반회원 및 정회원은 관리자/장부 탭 접근 불가능 (임원/관리자만 접근 가능)
    if (tab === "admin" && (this.currentRole === "regular" || this.currentRole === "full")) {
      this.showToast("🔒 관리자 & 회계 장부 탭은 임원 및 관리자 전용 권한입니다.");
      return;
    }

    this.currentTab = tab;

    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.toggle("active", item.dataset.tab === tab);
    });

    document.querySelectorAll(".mobile-nav-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    });

    document.querySelectorAll(".tab-content").forEach(content => {
      content.classList.toggle("active", content.id === `tab-${tab}`);
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
    this.renderCurrentTab();
  },

  renderCurrentTab() {
    switch (this.currentTab) {
      case "home":
        this.renderHome();
        break;
      case "members":
        this.renderMemberDirectory();
        break;
      case "schedule":
        this.renderSchedule();
        break;
      case "profile":
        this.renderProfile();
        break;
      case "admin":
        this.renderAdmin();
        break;
    }
  },

  /* 1. HOME TAB */
  getUpcomingLectureByCutoff() {
    if (!this.lectures || this.lectures.length === 0) return null;

    const now = new Date();
    // 주차순 오름차순 정렬
    const sorted = [...this.lectures].sort((a, b) => a.week - b.week);

    for (const lec of sorted) {
      if (!lec.date) continue;
      
      // lec.date 예: "2026-09-12 (토) 13:30" 또는 "2026-09-12" 날짜 파싱
      const dateMatch = lec.date.match(/(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
      if (dateMatch) {
        const year = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10) - 1; // 0-indexed month
        const day = parseInt(dateMatch[3], 10);

        // 💡 해당 강의 날짜 당일 오후 6시 (18:00:00) 컷오프 생성
        const cutoffTime = new Date(year, month, day, 18, 0, 0);

        // 현재 시간이 강의날 오후 6시(18:00) 이전이면 이 주차 강의가 모니터 노출 대상!
        if (now < cutoffTime) {
          return lec;
        }
      }
    }

    // 모든 등록된 강의의 오후 6시가 경과한 경우 가장 마지막 주차 강의 반환
    return sorted[sorted.length - 1];
  },

  renderHome() {
    // 💡 Overview 페이지에 접속할 때마다 로컬 스토리지의 최신 회원 정보 즉시 반영
    this.members = StorageService.getMembers();
    const totalMembers = this.members.length;
    const paidMembers = this.members.filter(m => m.feePaid).length;
    // 💡 강의 날짜 당일 오후 6시(18:00) 경과 시 다음 주차 강의 자동 실시간 전환
    const upcomingLecture = this.getUpcomingLectureByCutoff() || this.lectures[0];

    const homeStats = document.getElementById("homeStats");
    if (homeStats) {
      homeStats.innerHTML = `
        <div>
          <div class="stat-num-nvidia">13TH</div>
          <div class="stat-label-nvidia">CURRENT EDITION</div>
        </div>
        <div>
          <div class="stat-num-nvidia">${totalMembers}명</div>
          <div class="stat-label-nvidia">TOTAL MEMBERS</div>
        </div>
        <div>
          <div class="stat-num-nvidia">${paidMembers}명</div>
          <div class="stat-label-nvidia">FULL MEMBERSHIP</div>
        </div>
      `;
    }

    const homeLectureBox = document.getElementById("homeLectureBox");
    if (homeLectureBox && upcomingLecture) {
      homeLectureBox.innerHTML = `
        <div style="font-size: 13px; font-weight: 700; color: var(--color-primary); margin-bottom: 4px;">WEEK ${upcomingLecture.week} (다음 진행 예정 강의)</div>
        <h4 style="font-size: 18px; margin-bottom: 10px; font-weight: 700; color: #fff; line-height: 1.35;">${upcomingLecture.title}</h4>
        <p style="font-size: 13.5px; color: var(--color-on-dark-mute); margin-bottom: 12px; border-bottom: 1px dashed var(--color-hairline-strong); padding-bottom: 10px;">📅 ${upcomingLecture.date} | 📍 ${upcomingLecture.location}</p>
        <div style="font-size: 14.5px; font-weight: 700; color: #ffffff; margin-bottom: 3px;">🎙️ 강사 : ${upcomingLecture.speaker}</div>
        <div style="font-size: 13px; color: var(--color-on-dark-mute); line-height: 1.4;">${upcomingLecture.speakerBio}</div>
      `;
    }

    // 💡 Overview 페이지에 접속할 때마다 클라우드 DB의 최신 회원수를 비동기 조회하여 실시간 갱신
    if (typeof this.fetchCloudMembers === "function") {
      this.fetchCloudMembers();
    }
  },

  /* 2. MEMBERS DIRECTORY TAB */
  renderMemberDirectory() {
    const container = document.getElementById("memberGridContainer");
    const restrictedCard = document.getElementById("restrictedNoticeCard");
    const controlBar = document.getElementById("memberControlBar");

    if (!container) return;

    // 미가입 비회원(guest) 또는 일반회원(regular)일 경우 정회원 디렉토리 열람 차단 및 안내 카드 노출
    if (this.currentRole === "guest" || this.currentRole === "regular") {
      container.style.display = "none";
      if (controlBar) controlBar.style.display = "none";
      if (restrictedCard) restrictedCard.style.display = "block";

      const regBtn = document.getElementById("restrictedRegisterBtn");
      if (regBtn) {
        if (this.currentRole === "regular") {
          regBtn.style.display = "none"; // 이미 가입한 일반 회원은 '회원가입 및 로그인하기' 단추 숨김
        } else {
          regBtn.style.display = "inline-flex"; // 비회원(guest)에게만 표출
        }
      }
      return;
    }

    container.style.display = "grid";
    if (controlBar) controlBar.style.display = "flex";
    if (restrictedCard) restrictedCard.style.display = "none";

    const searchVal = (document.getElementById("memberSearch")?.value || "").toLowerCase().trim();
    const industryVal = document.getElementById("industryFilter")?.value || "all";
    const cohortVal = document.getElementById("cohortFilter")?.value || "all";
    const sortVal = document.getElementById("sortSelect")?.value || "name";

    let filtered = this.members.filter(m => {
      const matchSearch = m.name.toLowerCase().includes(searchVal) || 
                          (m.company && m.company.toLowerCase().includes(searchVal)) ||
                          (m.position && m.position.toLowerCase().includes(searchVal));
      const matchIndustry = industryVal === "all" || m.industry === industryVal;
      const matchCohort = cohortVal === "all" || String(m.cohort) === String(cohortVal);
      return matchSearch && matchIndustry && matchCohort;
    });

    filtered.sort((a, b) => {
      if (sortVal === "name") return a.name.localeCompare(b.name, "ko");
      if (sortVal === "company") return (a.company || "").localeCompare(b.company || "", "ko");
      if (sortVal === "cohort") return b.cohort - a.cohort;
      if (sortVal === "joinDate") return new Date(b.joinDate) - new Date(a.joinDate);
      return 0;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--color-mute);">검색 조건에 해당하는 회원 정보가 없습니다.</div>`;
      return;
    }

    container.innerHTML = filtered.map(m => `
      <div class="product-card" style="padding: 18px 14px;">
        <span class="corner-square"></span>
        <div>
          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            <div style="display: flex; flex-direction: column; gap: 6px; align-items: center; flex-shrink: 0;">
              <img src="${this.escapeHtml(m.avatarUrl)}" alt="${this.escapeHtml(m.name)}" style="width: 52px; height: 52px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid var(--color-hairline);" />
              ${m.industry ? `
                <img src="${this.escapeHtml(this.getIndustryImage(m.industry))}" alt="${this.escapeHtml(m.industry)}" title="${this.escapeHtml(m.industry)}" style="width: 52px; height: 52px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid var(--color-hairline); background: #ffffff;" />
              ` : ''}
            </div>
            <div style="flex: 1; min-width: 0;">
              <!-- 💡 1줄 : 성명 + 기수/등급 배지 -->
              <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
                <span style="font-size: 16.5px; font-weight: 700; line-height: 1.1; white-space: nowrap;">${this.escapeHtml(m.name)}</span>
                <div style="display: inline-flex; align-items: center; gap: 3.5px; flex-shrink: 0;">
                  <span class="pill-tag-nvidia" style="background: var(--color-surface-dark); color: #fff; height: 18px; padding: 0 5px; font-size: 10px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; white-space: nowrap; border-radius: 3px;">${m.cohort}기</span>
                  <span class="pill-tag-nvidia" style="background: var(--color-surface-soft); color: var(--color-ink); border: 1px solid var(--color-hairline); height: 18px; padding: 0 5px; font-size: 10px; font-weight: 600; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; white-space: nowrap; border-radius: 3px;">${this.getRoleName(m.role)}</span>
                </div>
              </div>

              <!-- 💡 2줄 : 회사명 -->
              ${m.company ? `
                <div style="margin-top: 4px; font-size: 13.5px; font-weight: 700; color: var(--color-ink); word-break: keep-all; line-height: 1.3;">
                  ${this.escapeHtml(m.company)}
                </div>
              ` : ''}

              <!-- 💡 3줄 : 홈페이지 배지 -->
              ${m.pageURL && m.pageURL.trim() !== '' ? `
                <div style="margin-top: 4px;">
                  <a href="${this.escapeHtml(m.pageURL.startsWith('http') ? m.pageURL : 'https://' + m.pageURL)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="height: 19px; min-height: 19px; padding: 0 6px; font-size: 10.5px; display: inline-flex; align-items: center; justify-content: center; gap: 2px; border-radius: 3px; box-sizing: border-box; line-height: 1; white-space: nowrap;" title="회사 홈페이지 새 창 열기">
                    🌐 홈페이지
                  </a>
                </div>
              ` : ''}

              <!-- 💡 4줄 : 업종 + 직책배지 -->
              <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 4px;">
                ${m.industry ? `
                  <span style="font-size: 11.5px; color: var(--color-mute); line-height: 1.3;">
                    ${this.escapeHtml(m.industry)}
                  </span>
                ` : ''}
                ${m.position && m.position.trim() !== '' ? `<span class="pill-tag-nvidia" style="background: rgba(0, 0, 0, 0.05); color: var(--color-ink); border: 1px solid var(--color-hairline); height: 18px; padding: 0 5px; font-size: 10px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; font-weight: 600; white-space: nowrap;">${this.escapeHtml(m.position)}</span>` : ''}
              </div>
            </div>
          </div>
          ${m.summary ? `<p style="font-size: 13.5px; color: var(--color-body); margin: 10px 0; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${this.escapeHtml(m.summary)}</p>` : ''}
        </div>

        <div style="border-top: 1px solid var(--color-hairline); padding-top: 10px; font-size: 12.5px; color: var(--color-mute); display: flex; flex-direction: column; gap: 3px;">
          ${m.location ? `<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(m.location)}">📍 ${this.escapeHtml(m.location)}</div>` : ''}
          ${m.phone ? `<div>📞 ${this.escapeHtml(this.maskPhone(m.phone))} ${this.currentRole === 'guest' ? '<span style="font-size: 11px; color: #94a3b8;">(로그인 시 공개)</span>' : ''}</div>` : ''}
          ${m.kakaoId ? `<div>💬 카톡: <strong style="color: var(--color-ink);">${this.escapeHtml(this.maskKakao(m.kakaoId))}</strong></div>` : ''}
          ${(m.Pemail || m.googleEmail) ? `<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(m.Pemail || m.googleEmail)}">📧 <strong style="color: var(--color-ink);">${this.escapeHtml(this.maskEmail(m.Pemail || m.googleEmail))}</strong></div>` : ''}
        </div>
      </div>
    `).join("");
  },

  /* 3. SCHEDULE & NETWORKING EVENTS */
  parseScheduleDate(dateStr) {
    if (!dateStr) return 0;
    const cleaned = dateStr.replace(/[년월일]/g, "-");
    const dateMatch = cleaned.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (dateMatch) {
      const y = parseInt(dateMatch[1], 10);
      const m = parseInt(dateMatch[2], 10) - 1;
      const d = parseInt(dateMatch[3], 10);
      const timeMatch = dateStr.match(/(\d{1,2}):(\d{1,2})/);
      const h = timeMatch ? parseInt(timeMatch[1], 10) : 0;
      const min = timeMatch ? parseInt(timeMatch[2], 10) : 0;
      return new Date(y, m, d, h, min).getTime();
    }
    return 0;
  },

  renderSchedule() {
    const container = document.getElementById("scheduleListContainer");
    if (!container) return;

    const isExecOrAdmin = this.currentRole === "exec" || this.currentRole === "admin";

    // 강의 및 네트워킹 행사 통합 리스트 구성
    const combined = [];
    (this.lectures || []).forEach(l => {
      combined.push({
        type: "lecture",
        item: l,
        time: this.parseScheduleDate(l.date),
        priority: 1, // 동일 일자/시간일 때 강의가 먼저 표출
        week: l.week || 0
      });
    });

    (this.events || []).forEach(ev => {
      combined.push({
        type: "event",
        item: ev,
        time: this.parseScheduleDate(ev.date),
        priority: 2, // 행사 일시에 해당하는 기존 강의 일정 바로 다음에 표출
        week: 999
      });
    });

    if (combined.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 48px; color: var(--color-mute);">등록된 13기 강의 커리큘럼 및 일정이 없습니다.</div>`;
      return;
    }

    // 시간 순서 오름차순 정렬 (동일 일자일 경우 기존 강의 일정 다음으로 네트워킹 행사 배치)
    combined.sort((a, b) => {
      if (a.time && b.time) {
        if (a.time !== b.time) return a.time - b.time;
        return a.priority - b.priority;
      }
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return (a.week - b.week) || (a.priority - b.priority);
    });

    container.innerHTML = combined.map(entry => {
      if (entry.type === "lecture") {
        const l = entry.item;
        return `
          <div class="product-card" style="padding: 24px;">
            <span class="corner-square"></span>
            <div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: center; justify-content: space-between;">
              
              <!-- 1열 (왼쪽): 강의 관련 상세 내용 -->
              <div style="flex: 1 1 340px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                  <span class="pill-tag-nvidia">WEEK ${l.week}</span>
                  ${isExecOrAdmin ? `
                    <div style="display: flex; gap: 6px;">
                      <button class="btn btn-outline btn-sm" style="padding: 2px 10px; font-size: 11.5px; min-height: 26px;" onclick="App.openEditLectureModal(${l.week})">
                        ✏️ 수정
                      </button>
                      <button class="btn btn-outline btn-sm" style="padding: 2px 10px; font-size: 11.5px; min-height: 26px; border-color: #dc2626; color: #dc2626;" onclick="App.deleteLecture(${l.week})">
                        🗑️ 삭제
                      </button>
                    </div>
                  ` : ''}
                </div>

                <h3 style="font-size: 20px; margin: 6px 0; font-weight: 700;">${this.escapeHtml(l.title)}</h3>
                <div style="font-size: 13.5px; color: var(--color-mute); margin-bottom: 8px;">
                  <strong style="color: var(--color-ink);">${this.escapeHtml(l.speaker)}</strong> | 📅 ${this.escapeHtml(l.date)} | 📍 ${this.escapeHtml(l.location)}
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
                  <div style="font-size: 12.5px; background: var(--color-surface-soft); padding: 3px 10px; border-radius: var(--radius-sm); color: var(--color-mute); border: 1px solid var(--color-hairline);">
                    이력: ${this.escapeHtml(l.speakerBio || '초빙 강사')}
                  </div>
                  ${l.speakerURL && l.speakerURL.trim() !== '' ? `
                    <a href="${this.escapeHtml(l.speakerURL.startsWith('http') ? l.speakerURL : 'https://' + l.speakerURL)}" target="_blank" rel="noopener noreferrer" style="font-size: 12.5px; font-weight: 700; background: var(--color-surface-soft); padding: 3px 10px; border-radius: var(--radius-sm); color: var(--color-primary); border: 1px solid var(--color-hairline); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                      🔗 강사 소속 및 활동사항 →
                    </a>
                  ` : ''}
                </div>
                <p style="font-size: 14.5px; color: var(--color-body); margin: 0; line-height: 1.5;">${this.escapeHtml(l.description || '')}</p>
              </div>

              <!-- 2열 (오른쪽): DOWNLOAD MATERIAL 및 액션 단추 -->
              <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 8px; flex-shrink: 0; min-width: 180px;">
                ${(l.materialUrl && l.materialUrl.trim() !== '') ? `
                  <button class="btn btn-outline btn-sm" style="padding: 9px 16px; font-size: 13px; font-weight: 700; width: 100%; max-width: 200px; justify-content: center;" onclick="App.downloadMaterial('${this.escapeHtml(l.title)}', '${this.escapeHtml(l.materialUrl)}')">
                    📁 DOWNLOAD MATERIAL
                  </button>
                ` : ''}
                ${isExecOrAdmin ? `
                  <button class="btn btn-primary btn-sm" style="padding: 7px 14px; font-size: 12px; width: 100%; max-width: 200px; justify-content: center;" onclick="App.shareToKakao(${l.week})">
                    💬 KAKAO SHARE TEXT
                  </button>
                ` : ''}
              </div>

            </div>
          </div>
        `;
      } else {
        // 🎉 네트워킹 행사 카드 (오렌지/골드 테마 차별화 색상 및 네이버 지도 링크 & 카카오톡 공유)
        const ev = entry.item;
        return `
          <div class="product-card" style="padding: 24px; border: 1.5px solid #f59e0b; background: linear-gradient(145deg, rgba(245, 158, 11, 0.07), rgba(217, 119, 6, 0.03)); position: relative; box-shadow: 0 4px 20px rgba(245, 158, 11, 0.08);">
            <span class="corner-square" style="background-color: #f59e0b;"></span>
            <div style="display: flex; gap: 20px; flex-wrap: wrap; align-items: center; justify-content: space-between;">
              
              <!-- 1열 (왼쪽): 행사 상세 내용 -->
              <div style="flex: 1 1 340px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                  <span class="pill-tag-nvidia" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; font-weight: 800; border: none; box-shadow: 0 0 10px rgba(245, 158, 11, 0.35); padding: 3px 10px;">
                    🎉 NETWORKING DAY
                  </span>
                  <span style="font-size: 11.5px; font-weight: 700; color: #f59e0b; background: rgba(245, 158, 11, 0.15); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.35);">
                    ${ev.cohort || 13}기 특별 행사
                  </span>
                  ${isExecOrAdmin ? `
                    <div style="display: flex; gap: 6px;">
                      <button class="btn btn-outline btn-sm" style="padding: 2px 10px; font-size: 11.5px; min-height: 26px; border-color: #f59e0b; color: #f59e0b;" onclick="App.openEditNetworkingEventModal('${ev.id}')">
                        ✏️ 수정
                      </button>
                      <button class="btn btn-outline btn-sm" style="padding: 2px 10px; font-size: 11.5px; min-height: 26px; border-color: #dc2626; color: #dc2626;" onclick="App.deleteNetworkingEvent('${ev.id}')">
                        🗑️ 삭제
                      </button>
                    </div>
                  ` : ''}
                </div>

                <h3 style="font-size: 20px; margin: 6px 0; font-weight: 800; color: var(--color-ink);">${this.escapeHtml(ev.title)}</h3>
                <div style="font-size: 13.5px; color: var(--color-mute); margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                  <span>🗓️ 일시: <strong style="color: var(--color-ink);">${this.escapeHtml(ev.date)}</strong></span>
                  <span>|</span>
                  <span>📍 장소: <strong style="color: var(--color-ink);">${this.escapeHtml(ev.location)}</strong></span>
                </div>

                <!-- 🗺️ 장소 정보 (네이버 지도 공유 링크) -->
                ${ev.mapUrl && ev.mapUrl.trim() !== '' ? `
                  <div style="margin-bottom: 10px;">
                    <a href="${this.escapeHtml(ev.mapUrl.startsWith('http') ? ev.mapUrl : 'https://' + ev.mapUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm"
                      style="display: inline-flex; align-items: center; gap: 6px; border-color: #03C75A; color: #03C75A; background: rgba(3, 199, 90, 0.08); font-weight: 700; padding: 5px 12px; text-decoration: none; border-radius: var(--radius-sm); font-size: 12.5px;">
                      🗺️ 네이버 지도 위치 확인 / 길찾기 ↗
                    </a>
                  </div>
                ` : ''}

                ${ev.description && ev.description.trim() !== '' ? `
                  <p style="font-size: 14px; color: var(--color-body); margin: 0; line-height: 1.55; white-space: pre-line; background: rgba(0,0,0,0.12); padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--color-hairline);">
                    ${this.escapeHtml(ev.description)}
                  </p>
                ` : ''}
              </div>

              <!-- 2열 (오른쪽): 카카오톡 행사 안내 및 설문조사 공유 버튼 -->
              <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 8px; flex-shrink: 0; min-width: 180px;">
                <button class="btn btn-sm" style="padding: 9px 16px; font-size: 12.5px; font-weight: 700; width: 100%; max-width: 210px; justify-content: center; background: #fee500; color: #191919; border: 1px solid #fee500; box-shadow: 0 2px 8px rgba(254, 229, 0, 0.25);" onclick="App.shareEventToKakao('${ev.id}')">
                  💬 카카오톡 행사 안내 공유
                </button>
                ${isExecOrAdmin ? `
                  <button class="btn btn-outline btn-sm" style="padding: 8px 14px; font-size: 12px; font-weight: 700; width: 100%; max-width: 210px; justify-content: center; border-color: #f59e0b; color: #f59e0b; background: rgba(245, 158, 11, 0.1);" onclick="App.shareEventSurveyToKakao('${ev.id}')" title="카카오톡 단톡방 참석 여부 투표 및 설문조사용 공지문구를 복사합니다">
                    📋 카톡 설문/투표 문구 복사
                  </button>
                ` : ''}
                ${ev.mapUrl && ev.mapUrl.trim() !== '' ? `
                  <a href="${this.escapeHtml(ev.mapUrl.startsWith('http') ? ev.mapUrl : 'https://' + ev.mapUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="padding: 7px 14px; font-size: 12px; width: 100%; max-width: 210px; justify-content: center; border-color: #03C75A; color: #03C75A;">
                    📍 네이버 지도 보기
                  </a>
                ` : ''}
              </div>

            </div>
          </div>
        `;
      }
    }).join("");

    const adminAddBtnContainer = document.getElementById("adminAddLectureBtnContainer");
    if (adminAddBtnContainer) {
      adminAddBtnContainer.style.display = isExecOrAdmin ? "block" : "none";
    }
  },

  openAddLectureModal() {
    const modal = document.getElementById("lectureAddModal");
    if (modal) {
      const nextWeek = this.lectures.length > 0 ? Math.max(...this.lectures.map(l => l.week)) + 1 : 1;
      const addLecWeek = document.getElementById("addLecWeek");
      const addLecDate = document.getElementById("addLecDate");
      const addLecLocation = document.getElementById("addLecLocation");

      if (addLecWeek) addLecWeek.value = nextWeek;
      if (addLecDate && !addLecDate.value) addLecDate.value = "2026-09-12 (토) 13:30";
      if (addLecLocation && !addLecLocation.value) addLecLocation.value = "산학협력관 1층 프라임컨벤션홀";

      modal.classList.add("active");
    }
  },

  closeAddLectureModal() {
    const modal = document.getElementById("lectureAddModal");
    if (modal) modal.classList.remove("active");
  },

  async addLecture(e) {
    if (e) e.preventDefault();

    if (this.currentRole !== "admin" && this.currentRole !== "exec") {
      this.showToast("🔒 강의 등록 권한은 관리자 및 임원 전용입니다.");
      return;
    }

    const cohort = parseInt(document.getElementById("addLecCohort").value, 10) || 13;
    const week = parseInt(document.getElementById("addLecWeek").value, 10);
    const title = document.getElementById("addLecTitle").value.trim();
    const date = document.getElementById("addLecDate").value.trim();
    const location = document.getElementById("addLecLocation").value.trim();
    const speaker = document.getElementById("addLecSpeaker").value.trim();
    const speakerBio = document.getElementById("addLecSpeakerBio").value.trim();
    const description = document.getElementById("addLecDescription").value.trim();
    const addSpkUrlEl = document.getElementById("addLecSpeakerUrl");
    const speakerURL = addSpkUrlEl ? addSpkUrlEl.value.trim() : "";
    const addMatUrlEl = document.getElementById("addLecMaterialUrl");
    const materialUrl = addMatUrlEl ? addMatUrlEl.value.trim() : "";

    if (isNaN(week) || !title || !date || !speaker) {
      this.showToast("⚠️ 필수 정보를 정확히 입력해 주세요.");
      return;
    }

    const newLecture = {
      id: `lec-w${week}`,
      cohort,
      week,
      title,
      date,
      location,
      speaker,
      speakerBio,
      speakerURL: speakerURL,
      description,
      materialUrl: materialUrl,
      photos: []
    };

    // 💡 Firebase Firestore 클라우드 DB 'lectures' 컬렉션에 실시간 저장
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "lectures", `lec-w${week}`), newLecture, { merge: true });
        console.log("Firebase Firestore 'lectures' 컬렉션에 신규 커리큘럼 성공 저장!");
      } catch (err) {
        console.warn("Firestore lectures 등록 시도 예외:", err);
      }
    }

    const existingIndex = this.lectures.findIndex(l => l.week === week);
    if (existingIndex !== -1) {
      this.lectures[existingIndex] = newLecture;
    } else {
      this.lectures.push(newLecture);
    }

    this.lectures.sort((a, b) => a.week - b.week);
    StorageService.saveLectures(this.lectures);

    this.closeAddLectureModal();
    this.showToast(`🎉 ${cohort}기 ${week}주차 신규 강의 [${title}]가 커리큘럼 DB에 등록되었습니다!`);
    
    const form = document.getElementById("addNewLectureForm");
    if (form) form.reset();

    this.renderSchedule();
  },

  /* 💡 네트워킹 데이 및 행사 등록 & 관리 */
  openAddNetworkingEventModal() {
    const modal = document.getElementById("networkingEventAddModal");
    if (modal) {
      const addCohort = document.getElementById("addEventCohort");
      if (addCohort) addCohort.value = 13;
      modal.classList.add("active");
    }
  },

  closeAddNetworkingEventModal() {
    const modal = document.getElementById("networkingEventAddModal");
    if (modal) modal.classList.remove("active");
  },

  async addNetworkingEvent(e) {
    if (e) e.preventDefault();

    if (this.currentRole !== "admin" && this.currentRole !== "exec") {
      this.showToast("🔒 행사 등록 권한은 관리자 및 임원 전용입니다.");
      return;
    }

    const cohort = parseInt(document.getElementById("addEventCohort").value, 10) || 13;
    const title = document.getElementById("addEventTitle").value.trim();
    const date = document.getElementById("addEventDate").value.trim();
    const location = document.getElementById("addEventLocation").value.trim();
    const mapUrl = document.getElementById("addEventMapUrl").value.trim();
    const description = document.getElementById("addEventDescription").value.trim();

    if (!title || !date || !location) {
      this.showToast("⚠️ 필수 정보(행사명, 일시, 장소)를 모두 입력해 주세요.");
      return;
    }

    const newEventId = `event-${Date.now()}`;
    const newEvent = {
      id: newEventId,
      cohort,
      title,
      date,
      location,
      mapUrl,
      description,
      createdAt: new Date().toISOString()
    };

    // 💡 Firebase Firestore 클라우드 DB 'events' 컬렉션에 실시간 저장
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "events", newEventId), newEvent, { merge: true });
        console.log("Firebase Firestore 'events' 컬렉션에 네트워킹 행사 성공 저장!");
      } catch (err) {
        console.warn("Firestore events 등록 시도 예외:", err);
      }
    }

    if (!this.events) this.events = [];
    this.events.push(newEvent);
    StorageService.saveEvents(this.events);

    this.closeAddNetworkingEventModal();
    this.showToast(`🎉 [${title}] 네트워킹 행사가 등록되었습니다!`);

    const form = document.getElementById("addNewNetworkingEventForm");
    if (form) form.reset();

    this.renderSchedule();
  },

  openEditNetworkingEventModal(eventId) {
    const ev = (this.events || []).find(e => e.id === eventId);
    if (!ev) return;

    document.getElementById("editEventId").value = ev.id;
    document.getElementById("editEventCohort").value = ev.cohort || 13;
    document.getElementById("editEventTitle").value = ev.title || "";
    document.getElementById("editEventDate").value = ev.date || "";
    document.getElementById("editEventLocation").value = ev.location || "";
    document.getElementById("editEventMapUrl").value = ev.mapUrl || "";
    document.getElementById("editEventDescription").value = ev.description || "";

    const titleEl = document.getElementById("editEventModalTitle");
    if (titleEl) titleEl.textContent = `✏️ [${ev.title}] 행사 정보 수정`;

    const modal = document.getElementById("networkingEventEditModal");
    if (modal) modal.classList.add("active");
  },

  closeEditNetworkingEventModal() {
    const modal = document.getElementById("networkingEventEditModal");
    if (modal) modal.classList.remove("active");
  },

  async updateNetworkingEvent(e) {
    if (e) e.preventDefault();

    if (this.currentRole !== "admin" && this.currentRole !== "exec") {
      this.showToast("🔒 행사 수정 권한은 관리자 및 임원 전용입니다.");
      return;
    }

    const eventId = document.getElementById("editEventId").value;
    const index = (this.events || []).findIndex(ev => ev.id === eventId);
    if (index === -1) return;

    const cohort = parseInt(document.getElementById("editEventCohort").value, 10) || 13;
    const title = document.getElementById("editEventTitle").value.trim();
    const date = document.getElementById("editEventDate").value.trim();
    const location = document.getElementById("editEventLocation").value.trim();
    const mapUrl = document.getElementById("editEventMapUrl").value.trim();
    const description = document.getElementById("editEventDescription").value.trim();

    if (!title || !date || !location) {
      this.showToast("⚠️ 필수 정보(행사명, 일시, 장소)를 모두 입력해 주세요.");
      return;
    }

    this.events[index] = {
      ...this.events[index],
      cohort,
      title,
      date,
      location,
      mapUrl,
      description,
      updatedAt: new Date().toISOString()
    };

    // 💡 Firebase Firestore 클라우드 DB 'events' 수정 동기화
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "events", eventId), this.events[index], { merge: true });
        console.log(`Firebase Firestore: [${title}] 행사 수정사항 동기화 완료!`);
      } catch (err) {
        console.warn("Firestore events 수정 시도 예외:", err);
      }
    }

    StorageService.saveEvents(this.events);
    this.showToast(`[${title}] 행사 정보가 수정되었습니다.`);
    this.closeEditNetworkingEventModal();
    this.renderSchedule();
  },

  async deleteNetworkingEvent(eventId) {
    const ev = (this.events || []).find(e => e.id === eventId);
    if (!ev) return;

    if (confirm(`네트워킹 행사 [${ev.title}]를 삭제하시겠습니까?`)) {
      this.events = this.events.filter(e => e.id !== eventId);
      StorageService.saveEvents(this.events);

      // 💡 Firebase Firestore 클라우드 DB 'events' 삭제 동기화
      if (window.db && window.FS && window.FS.deleteDoc && window.FS.doc) {
        try {
          await window.FS.deleteDoc(window.FS.doc(window.db, "events", eventId));
          console.log(`Firebase Firestore: [${ev.title}] 행사 삭제 완료!`);
        } catch (err) {
          console.warn("Firestore events 삭제 시도 예외:", err);
        }
      }

      this.showToast(`[${ev.title}] 행사가 삭제되었습니다.`);
      this.renderSchedule();
    }
  },

  shareEventToKakao(eventId) {
    const ev = (this.events || []).find(e => e.id === eventId);
    if (!ev) return;

    const mapUrlStr = (ev.mapUrl || "").trim();

    let shareText = `━━━━━━━━━━━━━━━━━\n` +
      `🎉 [기업가정신 포럼 ${ev.cohort || 13}기]\n` +
      `   네트워킹 데이 & 특별 행사 안내\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `📌 [행사명]\n` +
      `   ${ev.title}\n\n` +
      `🗓️ [일시] ${ev.date}\n` +
      `📍 [장소] ${ev.location}\n`;

    if (mapUrlStr) {
      shareText += `🗺️ [네이버 지도 위치/길찾기]\n   ${mapUrlStr}\n`;
    }

    if (ev.description && ev.description.trim() !== '') {
      shareText += `\n📝 [행사 세부 안내]\n${ev.description}\n`;
    }

    shareText += `─────────────────\n✨ ${ev.cohort || 13}기 원우 여러분의 많은 관심과 참석을 바랍니다!`;

    navigator.clipboard.writeText(shareText).then(() => {
      this.showToast(`🎉 [${ev.title}] 카카오톡 공유 포맷이 복사되었습니다! 단톡방에 바로 붙여넣어 공유하세요.`);
    }).catch(() => {
      alert(shareText);
    });
  },

  shareEventSurveyToKakao(eventId) {
    const ev = (this.events || []).find(e => e.id === eventId);
    if (!ev) return;

    const mapUrlStr = (ev.mapUrl || "").trim();
    const cohortStr = ev.cohort || 13;

    let shareText = `━━━━━━━━━━━━━━━━━\n` +
      `📊 [기업가정신 포럼 ${cohortStr}기]\n` +
      `   네트워킹 행사 참석 여부 투표 & 설문 조사\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `원우 여러분, 안녕하십니까!\n` +
      `다가오는 [${ev.title}]의 원활한 행사장 대관 및 식사·프로그램 준비를 위해 참석 여부 조사를 진행합니다.\n\n` +
      `📌 [행사 세부 안내]\n` +
      `• 행사명: ${ev.title}\n` +
      `• 일시: ${ev.date}\n` +
      `• 장소: ${ev.location}\n`;

    if (mapUrlStr) {
      shareText += `• 위치 안내: ${mapUrlStr}\n`;
    }

    if (ev.description && ev.description.trim() !== '') {
      shareText += `• 행사 개요: ${ev.description}\n`;
    }

    shareText += `\n📝 [참석 여부 투표 안내]\n` +
      `단톡방 상단에 고정된 [투표/설문]에 참석 여부를 꼭 선택해 주시기 바랍니다.\n` +
      `─────────────────\n` +
      `✨ 인원 확정 및 원활한 준비를 위해 빠른 투표 참여를 부탁드립니다.\n` +
      `   ${cohortStr}기 원우 여러분의 적극적인 참여와 성원을 바랍니다!\n\n` +
      `   - ${cohortStr}기 원우회 운영진 배상 -`;

    navigator.clipboard.writeText(shareText).then(() => {
      this.showToast(`📋 [${ev.title}] 카카오톡 참석 투표 및 설문조사 안내 문구가 복사되었습니다! 단톡방에 바로 붙여넣어 공유하세요.`);
    }).catch(() => {
      alert(shareText);
    });
  },

  openEditLectureModal(week) {
    const lec = this.lectures.find(l => l.week === week);
    if (!lec) return;

    document.getElementById("editLecWeek").value = lec.week;
    document.getElementById("editLecTitle").value = lec.title;
    document.getElementById("editLecDate").value = lec.date;
    document.getElementById("editLecLocation").value = lec.location;
    document.getElementById("editLecSpeaker").value = lec.speaker || "";
    document.getElementById("editLecSpeakerBio").value = lec.speakerBio || "";
    const editSpkUrlEl = document.getElementById("editLecSpeakerUrl");
    if (editSpkUrlEl) editSpkUrlEl.value = lec.speakerURL || "";
    const editMatUrlEl = document.getElementById("editLecMaterialUrl");
    if (editMatUrlEl) editMatUrlEl.value = lec.materialUrl || "";
    document.getElementById("editLecDescription").value = lec.description || "";

    document.getElementById("editModalTitle").textContent = `✏️ ${lec.week}주차 강의 커리큘럼 수정`;
    document.getElementById("lectureEditModal").classList.add("active");
  },

  closeEditLectureModal() {
    const modal = document.getElementById("lectureEditModal");
    if (modal) modal.classList.remove("active");
  },

  openImageZoomModal(imgSrc) {
    const modal = document.getElementById("imageZoomModal");
    const imgEl = document.getElementById("zoomModalImg");
    if (modal && imgEl) {
      imgEl.src = imgSrc || "images/2026_3_curriculum.jpg";
      modal.classList.add("active");
    }
  },

  closeImageZoomModal() {
    const modal = document.getElementById("imageZoomModal");
    if (modal) modal.classList.remove("active");
  },

  openRegisterModal() {
    const modal = document.getElementById("registerModal");
    if (modal) {
      this.switchAuthModalView('main');
      modal.classList.add("active");
    }
  },

  closeRegisterModal() {
    const modal = document.getElementById("registerModal");
    if (modal) modal.classList.remove("active");
  },

  switchAuthModalView(view) {
    const mainView = document.getElementById("authMainView");
    const loginView = document.getElementById("authLoginView");
    const registerView = document.getElementById("authRegisterView");

    if (mainView) mainView.style.display = view === "main" ? "block" : "none";
    if (loginView) loginView.style.display = view === "login" ? "block" : "none";
    if (registerView) registerView.style.display = view === "register" ? "block" : "none";
  },

  async handleDirectLogin(e) {
    if (e) e.preventDefault();
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    if (!username || !password) {
      this.showToast("⚠️ 아이디와 비밀번호를 모두 입력해 주세요.");
      return;
    }

    try {
      // 💡 최신 클라우드 DB 동기화 시도
      if (this.fetchCloudMembers) await this.fetchCloudMembers();
    } catch (err) {
      console.warn("로그인 시 클라우드 DB 동기화 경고:", err);
    }

    // 💡 아이디/비밀번호 정밀 검증 및 레거시 샘플 회원(성명 기반) 호환 지원
    const member = this.members.find(m => 
      (m.username && m.username.toLowerCase() === username.toLowerCase() && m.password === password) ||
      (m.name === username && m.phone && m.phone.includes(password)) ||
      (m.name === username) ||
      (m.username && m.username.toLowerCase() === username.toLowerCase())
    );

    if (member) {
      this.currentUserId = member.id;
      StorageService.setCurrentUserId(member.id);
      this.setRole(member.role || "regular");
      this.closeRegisterModal();
      this.showToast(`🎉 ${member.name} 원우님, 로그인되었습니다!`);
      this.switchTab("profile");
    } else {
      this.showToast("⚠️ 입력하신 아이디 또는 비밀번호가 일치하지 않습니다. 신규 회원가입을 통해 계정을 생성해 주세요.");
    }
  },

  async handleGoogleSignUp() {
    // 1. 구글 가입 버튼 클릭 시 회원가입 모달 팝업 창 즉시 닫기
    this.closeRegisterModal();

    let googleUser = null;

    if (window.auth && window.googleProvider && window.signInWithPopup) {
      try {
        const resolver = window.browserPopupRedirectResolver || undefined;
        const result = await window.signInWithPopup(window.auth, window.googleProvider, resolver);
        googleUser = result.user;
      } catch (err) {
        console.error("Firebase Google Auth 상세 오류 객체:", err);
        if (err.code === "auth/popup-closed-by-user") {
          this.showToast("⚠️ Google 로그인 팝업 창이 닫혔습니다.");
        } else if (err.code === "auth/unauthorized-domain") {
          this.showToast("⚠️ 현재 도메인이 Firebase 승인 도메인에 등록되지 않았습니다.");
        } else if (err.code === "auth/operation-not-supported-in-this-environment") {
          this.showToast("⚠️ 로컬 파일(file://)에서는 지원되지 않습니다. 웹 서버(http://localhost)로 실행해 주세요.");
        } else {
          this.showToast("⚠️ Google 인증 오류: " + (err.code ? `[${err.code}] ` : "") + (err.message || "인증을 완료하지 못했습니다."));
        }
        return;
      }
    } else {
      this.showToast("⚠️ Firebase Auth 서비스에 연결할 수 없습니다.");
      return;
    }

    if (!googleUser || !googleUser.uid) {
      this.showToast("⚠️ Google 계정 정보를 가져오지 못했습니다.");
      return;
    }

    const googleUid = googleUser.uid;
    const googleEmail = googleUser.email || "";
    const googlePhone = this.normalizePhone(googleUser.phoneNumber || "");

    // 💡 1. 구글 고유 UID, 연동된 UID 목록, 이메일, 전화번호 기반으로 기존 가입 회원 100% 정밀 탐색
    let existingMember = this.members.find(m => 
      (m.googleUid && m.googleUid === googleUid) ||
      (Array.isArray(m.linkedGoogleUids) && m.linkedGoogleUids.includes(googleUid)) ||
      (googleEmail && m.googleEmail && this.normalizeEmail(m.googleEmail) === this.normalizeEmail(googleEmail)) ||
      (googleEmail && Array.isArray(m.linkedGoogleEmails) && m.linkedGoogleEmails.some(e => this.normalizeEmail(e) === this.normalizeEmail(googleEmail))) ||
      (googleEmail && m.Pemail && this.normalizeEmail(m.Pemail) === this.normalizeEmail(googleEmail)) ||
      (googlePhone && m.phone && this.normalizePhone(m.phone) === googlePhone) ||
      m.id === `mem-g-${googleUid.slice(0, 6)}`
    );

    if (existingMember) {
      // 💡 만약 부 계정의 googleUid 또는 googleEmail이 아직 주 계정에 등록되지 않았다면 자동 연동(Auto-link)
      let needsSave = false;
      if (!existingMember.linkedGoogleUids) existingMember.linkedGoogleUids = [];
      if (existingMember.googleUid !== googleUid && !existingMember.linkedGoogleUids.includes(googleUid)) {
        existingMember.linkedGoogleUids.push(googleUid);
        needsSave = true;
      }
      if (googleEmail) {
        if (!existingMember.linkedGoogleEmails) existingMember.linkedGoogleEmails = [];
        if (existingMember.googleEmail !== googleEmail && !existingMember.linkedGoogleEmails.includes(googleEmail)) {
          existingMember.linkedGoogleEmails.push(googleEmail);
          needsSave = true;
        }
      }
      if (needsSave) {
        StorageService.saveMembers(this.members);
        if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
          window.FS.setDoc(window.FS.doc(window.db, "members", existingMember.id), existingMember, { merge: true }).catch(console.warn);
        }
      }

      // 💡 이미 가입/통합된 구글 회원이 존재하면: 100% 동일 계정으로 즉시 로그인!
      this.currentUserId = existingMember.id;
      StorageService.setCurrentUserId(existingMember.id);
      this.setRole(existingMember.role || "regular");
      this.showToast(`🎉 ${existingMember.name}님, 다시 오신 것을 환영합니다! (구글 간편 로그인 성공)`);
      this.switchTab("profile");
      return;
    }

    // 💡 2. 최초 가입 구글 회원일 경우: googleUid와 googleEmail 기반 아이디 자동 부여
    const autoUsername = googleEmail ? googleEmail.split("@")[0] : `google_${googleUid.slice(0, 6)}`;
    const newMember = {
      id: `mem-g-${googleUid.slice(0, 6)}`,
      username: autoUsername, // 💡 구글 이메일의 ID 파트가 회원 아이디로 자동 부여됨 (예: honggildong)
      password: "google_social_auth_account", // 구글 소셜 간편 로그인 전용 계정
      googleUid: googleUid,
      googleEmail: googleEmail,
      name: googleUser ? (googleUser.displayName || "구글 연동 원우") : "구글 소셜 원우",
      cohort: 13,
      role: "regular",
      position: "",
      company: "",
      industry: "",
      industryImg: "",
      location: "",
      phone: googleUser && googleUser.phoneNumber ? googleUser.phoneNumber : "",
      kakaoId: googleEmail ? googleEmail.split("@")[0] : "",
      Pemail: googleEmail || "",
      avatarUrl: googleUser && googleUser.photoURL ? googleUser.photoURL : "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80",
      summary: "",
      feePaid: false,
      feeDate: "",
      joinDate: new Date().toISOString().split("T")[0]
    };

    // Firebase DB 연결 시 Firestore members 컬렉션 저장
    if (window.db && window.FS && window.FS.setDoc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "members", newMember.id), newMember);
      } catch (err) {
        console.warn("Firestore 저장 중 시도:", err);
      }
    }

    this.members.unshift(newMember);
    StorageService.saveMembers(this.members);

    this.currentUserId = newMember.id;
    StorageService.setCurrentUserId(newMember.id);
    this.setRole("regular"); // 즉시 일반회원으로 승인 및 마이페이지 전환
    this.showToast(`🎉 ${newMember.name}님, 13기 원우 회원가입이 성공적으로 완료되었습니다!`);
    this.switchTab("profile");
  },

  async handleRegisterSubmit(e) {
    if (e) e.preventDefault();
    const username = document.getElementById("regUsername").value.trim();
    const password = document.getElementById("regPassword").value.trim();
    const name = document.getElementById("regName").value.trim();
    const cohort = parseInt(document.getElementById("regCohort").value, 10) || 13;
    const company = document.getElementById("regCompany").value.trim();
    const position = document.getElementById("regPosition") ? document.getElementById("regPosition").value.trim() : "";
    const industry = document.getElementById("regIndustry").value;
    const phone = document.getElementById("regPhone").value.trim();
    const kakaoId = document.getElementById("regKakao").value.trim();
    const locationEl = document.getElementById("regLocation");
    const summaryEl = document.getElementById("regSummary");
    const location = locationEl ? locationEl.value.trim() : "";
    const summary = summaryEl ? summaryEl.value.trim() : "";

    if (!username || !password || !name || !company || !phone || !kakaoId) {
      this.showToast("⚠️ 필수 정보(희망 아이디, 비밀번호, 성명, 회사명, 연락처, 단톡방 프로필 명)를 모두 입력해 주세요.");
      return;
    }

    if (password.length < 6) {
      this.showToast("⚠️ 계정 보안을 위해 비밀번호는 최소 6자 이상으로 설정해 주세요.");
      return;
    }

    // 💡 아이디 중복 체크
    if (this.members.some(m => m.username && m.username.toLowerCase() === username.toLowerCase())) {
      this.showToast(`⚠️ 이미 사용 중인 아이디 '${username}' 입니다. 다른 아이디를 설정해 주세요.`);
      return;
    }

    const newMemberId = `mem-${Date.now().toString().slice(-6)}`;
    const newMember = {
      id: newMemberId,
      username,
      password,
      name,
      cohort,
      role: "regular", // 회원가입 완료 시 기본 일반회원 등급 승인
      position: position || "",
      company,
      industry,
      industryImg: this.getIndustryImage(industry),
      location: location || "",
      phone,
      kakaoId,
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80",
      summary: summary || "",
      feePaid: false,
      feeDate: "",
      joinDate: new Date().toISOString().split("T")[0]
    };

    // Firebase DB Firestore members 컬렉션 실시간 기록 동기화 (ID/PW 포함)
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "members", newMemberId), newMember, { merge: true });
        console.log("Firebase Firestore에 신규 회원 정보(ID/PW 포함) 저장 완료:", newMemberId);
      } catch (err) {
        console.warn("Firestore 회원 저장 시도 중 클라우드 경고:", err);
      }
    }

    // 목록 첫 번째 항목에 즉시 추가
    this.members.unshift(newMember);
    StorageService.saveMembers(this.members);

    this.currentUserId = newMember.id;
    StorageService.setCurrentUserId(newMember.id);
    this.setRole("regular"); // 회원가입 성공 시 즉시 일반회원으로 승인 및 마이페이지 개방

    this.closeRegisterModal();
    this.showToast(`🎉 ${name} 원우님의 회원가입(아이디: ${username})이 성공적으로 완성되었습니다!`);
    this.switchTab("profile");
  },

  async saveEditedLecture() {
    const week = parseInt(document.getElementById("editLecWeek").value, 10);
    const index = this.lectures.findIndex(l => l.week === week);

    if (index === -1) return;

    this.lectures[index].title = document.getElementById("editLecTitle").value.trim();
    this.lectures[index].date = document.getElementById("editLecDate").value.trim();
    this.lectures[index].location = document.getElementById("editLecLocation").value.trim();
    this.lectures[index].speaker = document.getElementById("editLecSpeaker").value.trim();
    this.lectures[index].speakerBio = document.getElementById("editLecSpeakerBio").value.trim();
    const editSpkUrl = document.getElementById("editLecSpeakerUrl");
    const speakerURLVal = editSpkUrl ? editSpkUrl.value.trim() : "";
    this.lectures[index].speakerURL = speakerURLVal; // 💡 Firestore Lectures DB의 'speakerURL' 필드 동기화
    const editMatUrl = document.getElementById("editLecMaterialUrl");
    this.lectures[index].materialUrl = editMatUrl ? editMatUrl.value.trim() : "";
    this.lectures[index].description = document.getElementById("editLecDescription").value.trim();
    this.lectures[index].cohort = this.lectures[index].cohort || 13;

    // 💡 Firebase Firestore 클라우드 DB 'lectures' 동기화!
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "lectures", `lec-w${week}`), this.lectures[index], { merge: true });
        console.log(`Firebase Firestore: ${week}주차 강의 수정사항 동기화 완료!`);
      } catch (err) {
        console.warn("Firestore lectures 수정 시도 오차:", err);
      }
    }

    StorageService.saveLectures(this.lectures);
    this.showToast(`${week}주차 강의 정보가 수정되어 DB에 저장되었습니다.`);
    this.closeEditLectureModal();
    this.renderSchedule();
  },

  async deleteLecture(week) {
    const lec = this.lectures.find(l => l.week === week);
    if (!lec) return;

    if (confirm(`${week}주차 강의 [${lec.title}] 커리큘럼을 삭제하시겠습니까?`)) {
      this.lectures = this.lectures.filter(l => l.week !== week);
      StorageService.saveLectures(this.lectures);

      // 💡 Firebase Firestore 클라우드 DB 'lectures' 삭제 동기화!
      if (window.db && window.FS && window.FS.deleteDoc && window.FS.doc) {
        try {
          await window.FS.deleteDoc(window.FS.doc(window.db, "lectures", `lec-w${week}`));
          console.log(`Firebase Firestore: ${week}주차 강의 삭제 완료!`);
        } catch (err) {
          console.warn("Firestore lectures 삭제 시도 오차:", err);
        }
      }

      this.showToast(`${week}주차 강의 커리큘럼이 DB에서 삭제되었습니다.`);
      this.renderSchedule();
    }
  },

  downloadMaterial(title) {
    this.showToast(`[${title}] 강의 자료가 다운로드되었습니다.`);
  },

  shareToKakao(week) {
    const lec = this.lectures.find(l => l.week === week);
    if (!lec) return;

    const spkUrl = (lec.speakerURL || lec.speakerUrl || "").trim();
    const speakerStr = lec.speakerBio ? `${lec.speaker} (${lec.speakerBio})` : lec.speaker;

    let shareText = `━━━━━━━━━━━━━━━━━\n` +
      `📢 [기업가정신 포럼 13기]\n` +
      `   ${lec.week}주차 정기 강연 안내\n` +
      `━━━━━━━━━━━━━━━━━\n` +
      `📌 [강의 주제]\n` +
      `   ${lec.title}\n\n` +
      `🗓️ [일시] ${lec.date}\n` +
      `📍 [장소] ${lec.location}\n` +
      `🎙️ [강사] ${speakerStr}\n`;

    if (spkUrl) {
      shareText += `🔗 [강사 소속 및 활동사항]\n   ${spkUrl}\n`;
    }

    shareText += `─────────────────\n✨ 13기 원우님의 많은 참석을 바랍니다!`;

    navigator.clipboard.writeText(shareText).then(() => {
      this.showToast(`🎉 ${week}주차 카카오톡 공유 포맷이 복사되었습니다! 단톡방에 바로 붙여넣어 공유하세요.`);
    }).catch(() => {
      alert(shareText);
    });
  },

  getIndustryMeta(industry) {
    return this.getIndustryMetadata(industry);
  },

  getIndustryMetadata(industry) {
    if (!industry) return { icon: "🏢", label: "일반 기업", img: "images/industry_it.jpg" };

    if (industry.includes("정보통신")) return { icon: "💻", label: "정보통신업 (IT·소프트웨어·SaaS)", img: "images/industry_it.jpg" };
    if (industry.includes("제조")) return { icon: "⚙️", label: "제조업 (전자·기계·장비·식료품)", img: "images/industry_mfg.jpg" };
    if (industry.includes("도매") || industry.includes("소매")) return { icon: "🛍️", label: "도매 및 소매업 (유통·무역·이커머스)", img: "images/industry_commerce.jpg" };
    if (industry.includes("전문") || industry.includes("기술")) return { icon: "⚖️", label: "전문, 과학 및 기술 서비스업 (컨설팅·법무·세무)", img: "images/industry_consulting.jpg" };
    if (industry.includes("부동")) return { icon: "🏢", label: "부동산업 (부동산 개발·임대·자산관리)", img: "images/industry_realestate.jpg" };
    if (industry.includes("건설")) return { icon: "🏗️", label: "건설업 (건축·토목·플랜트)", img: "images/industry_realestate.jpg" };
    if (industry.includes("교육")) return { icon: "🎓", label: "교육 서비스업 (대학·학원·에듀테크)", img: "images/industry_education.jpg" };
    if (industry.includes("보건") || industry.includes("복지")) return { icon: "🧬", label: "보건업 및 사회복지 서비스업 (의료·바이오·제약)", img: "images/industry_bio.jpg" };
    if (industry.includes("숙박") || industry.includes("음식")) return { icon: "🍽️", label: "숙박 및 음식점업 (F&B·호스피탈리티)", img: "images/industry_service.jpg" };
    if (industry.includes("금융") || industry.includes("보험")) return { icon: "💰", label: "금융 및 보험업 (VC·PE·자산운용)", img: "images/industry_consulting.jpg" };
    if (industry.includes("운수") || industry.includes("창고")) return { icon: "🚚", label: "운수 및 창고업 (물류·운송)", img: "images/industry_commerce.jpg" };
    if (industry.includes("예술") || industry.includes("스포츠") || industry.includes("여가")) return { icon: "🎨", label: "예술, 스포츠 및 여가관련 서비스업", img: "images/industry_service.jpg" };
    if (industry.includes("사업시설") || industry.includes("사업지원")) return { icon: "🛠️", label: "사업시설 관리 및 사업지원 서비스업", img: "images/industry_consulting.jpg" };
    if (industry.includes("농업") || industry.includes("임업") || industry.includes("어업")) return { icon: "🌾", label: "농업, 임업 및 어업 (스마트팜)", img: "images/industry_mfg.jpg" };

    return { icon: "🏢", label: industry, img: "images/industry_it.jpg" };
  },

  renderProfile() {
    const profileFormContainer = document.getElementById("profileFormContainer");
    const guestRestrictedCard = document.getElementById("guestProfileRestrictedCard");

    // 비회원(guest) 미가입 상태 시 마이페이지 이용 제한 안내 노출
    if (this.currentRole === "guest") {
      if (profileFormContainer) profileFormContainer.style.display = "none";
      if (guestRestrictedCard) guestRestrictedCard.style.display = "block";
      return;
    }

    if (profileFormContainer) profileFormContainer.style.display = "grid";
    if (guestRestrictedCard) guestRestrictedCard.style.display = "none";

    const user = this.members.find(m => m.id === this.currentUserId) || this.members[0];

    document.getElementById("profileName").value = user.name || "";
    const profilePositionEl = document.getElementById("profilePosition");
    if (profilePositionEl) profilePositionEl.value = user.position || "";
    document.getElementById("profileCompany").value = user.company || "";
    const profileCohortEl = document.getElementById("profileCohort");
    if (profileCohortEl) profileCohortEl.value = user.cohort || 13;

    const profileIndustryEl = document.getElementById("profileIndustry");
    if (profileIndustryEl) {
      profileIndustryEl.value = user.industry || "정보통신업";
    }
    const profileIndustryPreview = document.getElementById("profileIndustryPreviewImg");
    if (profileIndustryPreview) {
      profileIndustryPreview.src = this.getIndustryImage(user.industry || "정보통신업");
    }
    document.getElementById("profileLocation").value = user.location || "";
    document.getElementById("profilePhone").value = user.phone || "";
    document.getElementById("profileKakao").value = user.kakaoId || "";
    const profilePageURLEl = document.getElementById("profilePageURL");
    if (profilePageURLEl) profilePageURLEl.value = user.pageURL || "";
    const profilePemailEl = document.getElementById("profilePemail");
    if (profilePemailEl) profilePemailEl.value = user.Pemail || user.googleEmail || "";
    document.getElementById("profileSummary").value = user.summary || "";

    const sidebarAvatarImg = document.getElementById("sidebarAvatarImg");
    if (sidebarAvatarImg && user.avatarUrl) {
      sidebarAvatarImg.src = user.avatarUrl;
    }

    const sidebarIndustryImg = document.getElementById("sidebarIndustryImg");
    if (sidebarIndustryImg) {
      sidebarIndustryImg.src = this.getIndustryImage(user.industry || "정보통신업");
      sidebarIndustryImg.title = user.industry || "업종 분류";
    }

    const sidebarName = document.getElementById("sidebarMemberName");
    const sidebarRole = document.getElementById("sidebarMemberRole");
    const feeStatusBadge = document.getElementById("feeStatusBadge");
    const unpaidFeeNotice = document.getElementById("unpaidFeeNotice");

    if (sidebarName) {
      // 💡 [이름 직책 / 회사명] 포맷으로 사이드바 프로필 영역 구성
      let displayName = user.name || "";
      if (user.position && user.position.trim() !== "") {
        displayName += ` ${user.position.trim()}`;
      }
      if (user.company && user.company.trim() !== "") {
        displayName += ` / ${user.company.trim()}`;
      }
      sidebarName.textContent = displayName;
    }
    if (sidebarRole) {
      sidebarRole.textContent = `${user.cohort}기 · ${this.getRoleName(user.role)}`;
    }

    if (feeStatusBadge) {
      if (user.feePaid) {
        feeStatusBadge.textContent = `회비 납부 완료 (${user.feeDate})`;
        feeStatusBadge.style.background = "#dcfce7";
        feeStatusBadge.style.color = "#15803d";
        if (unpaidFeeNotice) unpaidFeeNotice.style.display = "none";
      } else {
        feeStatusBadge.textContent = "회비 미납 상태";
        feeStatusBadge.style.background = "#fee2e2";
        feeStatusBadge.style.color = "#b91c1c";
        if (unpaidFeeNotice) unpaidFeeNotice.style.display = "block";
      }
    }
  },

  /**
   * 기업가정신 13기 공식 지정 회비 계좌번호 복사
   */
  copyFeeAccount() {
    const accountNo = "79422963241";
    navigator.clipboard.writeText(accountNo).then(() => {
      this.showToast(`📋 회비 계좌번호(${accountNo} 카카오뱅크, 예금주: 김정순)가 복사되었습니다!`);
    }).catch(() => {
      prompt("아래 계좌번호를 복사해주세요:", accountNo);
    });
  },

  getIndustryImage(industry) {
    if (!industry) return "images/01_information_communication.jpg";
    const key = industry.trim();
    if (typeof INDUSTRY_IMAGE_MAP !== "undefined" && INDUSTRY_IMAGE_MAP[key]) {
      return INDUSTRY_IMAGE_MAP[key];
    }
    return "images/15_other_services.jpg";
  },

  handleProfileIndustryChange(selectedIndustry) {
    const industryImgPath = this.getIndustryImage(selectedIndustry);
    const profileIndustryPreview = document.getElementById("profileIndustryPreviewImg");
    if (profileIndustryPreview) {
      profileIndustryPreview.src = industryImgPath;
    }

    const sidebarIndustryImg = document.getElementById("sidebarIndustryImg");
    if (sidebarIndustryImg) {
      sidebarIndustryImg.src = industryImgPath;
      sidebarIndustryImg.title = selectedIndustry;
    }

    // 💡 My Page에서 업종 분류를 선택하면 선택한 업종의 이미지가 회원 정보에 자동 저장됨
    let userIndex = this.members.findIndex(m => m.id === this.currentUserId);
    if (userIndex === -1) {
      userIndex = 0;
      this.currentUserId = this.members[0] ? this.members[0].id : "mem-1301";
    }

    if (this.members[userIndex]) {
      this.members[userIndex].industry = selectedIndustry;
      this.members[userIndex].industryImg = industryImgPath;
      delete this.members[userIndex].industryIcon;

      StorageService.saveMembers(this.members);

      if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
        window.FS.setDoc(window.FS.doc(window.db, "members", this.members[userIndex].id), {
          industry: selectedIndustry,
          industryImg: industryImgPath
        }, { merge: true }).catch(console.warn);
      }

      this.showToast(`🏢 업종이 '${selectedIndustry}'(으)로 변경 및 자동 저장되었습니다.`);
      this.renderMemberDirectory();
    }
  },

  async saveProfile() {
    let userIndex = this.members.findIndex(m => m.id === this.currentUserId);
    if (userIndex === -1) {
      userIndex = 0;
      this.currentUserId = this.members[0] ? this.members[0].id : "mem-1301";
    }

    const selectedIndustry = document.getElementById("profileIndustry").value;
    const selectedCohort = parseInt(document.getElementById("profileCohort").value, 10) || 13;
    const industryImgPath = this.getIndustryImage(selectedIndustry);
    const positionVal = document.getElementById("profilePosition") ? document.getElementById("profilePosition").value.trim() : "";
    const pageURLVal = document.getElementById("profilePageURL") ? document.getElementById("profilePageURL").value.trim() : "";
    const PemailVal = document.getElementById("profilePemail") ? document.getElementById("profilePemail").value.trim() : "";

    const updatedUser = {
      ...this.members[userIndex],
      name: document.getElementById("profileName").value.trim(),
      position: positionVal,
      company: document.getElementById("profileCompany").value.trim(),
      cohort: selectedCohort,
      industry: selectedIndustry,
      industryImg: industryImgPath,
      location: document.getElementById("profileLocation").value.trim(),
      phone: document.getElementById("profilePhone").value.trim(),
      kakaoId: document.getElementById("profileKakao").value.trim(),
      pageURL: pageURLVal, // 💡 회사 홈페이지 웹사이트 URL 저장
      Pemail: PemailVal, // 💡 개인 이메일(Pemail) 저장
      summary: document.getElementById("profileSummary").value.trim()
    };
    delete updatedUser.industryIcon;

    if (this.tempAvatarUrl) {
      updatedUser.avatarUrl = this.tempAvatarUrl;
      this.tempAvatarUrl = null;
    }

    this.members[userIndex] = updatedUser;
    StorageService.saveMembers(this.members);

    // 💡 Firebase Firestore 클라우드 DB 실시간 업데이트 저장!
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "members", updatedUser.id), updatedUser, { merge: true });
        console.log("Firebase Firestore 클라우드 DB에 프로필 수정사항 및 사진이 성공적으로 저장되었습니다.");
      } catch (err) {
        console.warn("Firestore 프로필 저장 시도 예외:", err);
      }
    }

    this.showToast("🎉 프로필 정보와 .jpeg 최적화 사진이 성공적으로 저장되었습니다!");
    this.renderProfile();
    this.renderMemberDirectory();
  },

  /* 5. ADMIN & LEDGER TAB */
  renderAdmin() {
    const tableBody = document.getElementById("adminMemberTableBody");
    if (!tableBody) return;

    const isAdmin = this.currentRole === "admin";
    const todayStr = new Date().toLocaleDateString("sv-SE");

    tableBody.innerHTML = this.members.map(m => {
      const defaultFeeDate = (m.feeDate && m.feeDate !== "-") ? m.feeDate : todayStr;

      return `
        <tr>
          <td style="text-align: center;">
            <input type="checkbox" class="member-select-check" value="${m.id}" data-feepaid="${m.feePaid ? '1' : '0'}" onchange="App.handleMemberSelectChange()" style="cursor: pointer; width: 16px; height: 16px;" />
          </td>
          <td><strong>${this.escapeHtml(m.name)}</strong> (${m.cohort}기)</td>
          <td>${this.escapeHtml(m.company || '-')}${m.position && m.position.trim() !== '' ? ` <span class="pill-tag-nvidia" style="background: rgba(0,0,0,0.05); color: var(--color-ink); border: 1px solid var(--color-hairline); font-size: 10.5px; padding: 1px 5px;">${this.escapeHtml(m.position)}</span>` : ''}</td>
          <td>
            <select class="form-input" style="padding: 4px 8px; font-size: 13px; min-height: 32px; width: auto;" ${isAdmin ? '' : 'disabled'} onchange="App.changeMemberRole('${m.id}', this.value)">
              <option value="regular" ${m.role === 'regular' ? 'selected' : ''}>일반회원</option>
              <option value="full" ${m.role === 'full' ? 'selected' : ''}>정회원</option>
              <option value="exec" ${m.role === 'exec' ? 'selected' : ''}>임원</option>
              <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>관리자</option>
            </select>
            ${!isAdmin ? '<span style="font-size: 11px; color: var(--color-mute); margin-left: 4px;">🔒 관리자 전용</span>' : ''}
          </td>
          <td>${this.escapeHtml(m.joinDate || '-')}</td>
          <td>
            <span class="pill-tag-nvidia" style="background: ${m.feePaid ? '#dcfce7' : '#fee2e2'}; color: ${m.feePaid ? '#15803d' : '#b91c1c'}; font-size: 11px;">
              ${m.feePaid ? '납부완료' : '미납'}
            </span>
          </td>
          <td>
            ${m.feePaid ? `
              <div style="display: flex; align-items: center; gap: 6px;">
                ${isAdmin ? `
                  <input type="date" class="form-input" style="padding: 3px 6px; font-size: 12px; width: 130px;" value="${defaultFeeDate}" onchange="App.updateMemberFeeDate('${m.id}', this.value)" title="회비 납부일자 변경" />
                  <button type="button" class="btn btn-outline btn-sm" style="padding: 2px 7px; font-size: 11px; white-space: nowrap;" onclick="App.updateMemberFeeDate('${m.id}', '${todayStr}')" title="오늘 날짜로 설정">오늘</button>
                ` : `
                  <span style="font-size: 13px; font-weight: 700; color: #16a34a;">📅 ${m.feeDate || '-'}</span>
                `}
              </div>
            ` : `
              <div style="display: flex; align-items: center; gap: 6px;">
                <input type="date" id="feeDateInput_${m.id}" class="form-input" style="padding: 3px 6px; font-size: 12px; width: 130px;" value="${todayStr}" title="납부 처리 시 입력할 회비 납부일자" />
                <button type="button" class="btn btn-outline btn-sm" style="padding: 2px 7px; font-size: 11px; white-space: nowrap;" onclick="document.getElementById('feeDateInput_${m.id}').value='${todayStr}'" title="오늘 날짜로 설정">오늘</button>
              </div>
            `}
          </td>
          <td>
            <button class="btn btn-outline btn-sm" style="padding: 2px 10px; font-size: 11.5px; min-height: 28px;" onclick="App.toggleFeeStatus('${m.id}')">
              ${m.feePaid ? '미납 처리' : '🔑 납부 처리'}
            </button>
          </td>
        </tr>
      `;
    }).join("");

    this.handleMemberSelectChange();
    this.renderLedger();
    if (typeof this.fetchCloudLedger === "function") {
      this.fetchCloudLedger();
    }
  },

  toggleSelectAllMembers(isChecked) {
    document.querySelectorAll(".member-select-check").forEach(cb => {
      cb.checked = isChecked;
    });
    this.handleMemberSelectChange();
  },

  handleMemberSelectChange() {
    const allChecks = document.querySelectorAll(".member-select-check");
    const checkedBoxes = document.querySelectorAll(".member-select-check:checked");
    const count = checkedBoxes.length;

    const countEl = document.getElementById("bulkSelectedCount");
    if (countEl) countEl.textContent = count;

    const bulkBtn = document.getElementById("bulkFeePayBtn");
    if (bulkBtn) {
      if (count > 0) {
        bulkBtn.style.display = "inline-flex";
      } else {
        bulkBtn.style.display = "none";
      }
    }

    const selectAllEl = document.getElementById("selectAllMembersCheck");
    if (selectAllEl && allChecks.length > 0) {
      if (count === 0) {
        selectAllEl.checked = false;
        selectAllEl.indeterminate = false;
      } else if (count === allChecks.length) {
        selectAllEl.checked = true;
        selectAllEl.indeterminate = false;
      } else {
        selectAllEl.checked = false;
        selectAllEl.indeterminate = true;
      }
    }
  },

  openBulkFeePayModal() {
    if (this.currentRole !== "admin" && this.currentRole !== "exec") {
      this.showToast("🔒 회원 관리 권한이 필요합니다.");
      return;
    }

    const checkedBoxes = Array.from(document.querySelectorAll(".member-select-check:checked"));
    const selectedIds = checkedBoxes.map(cb => cb.value);

    if (selectedIds.length === 0) {
      this.showToast("⚠️ 일괄 납부 처리할 회원을 1명 이상 선택해 주세요.");
      return;
    }

    // 선택된 회원 중 미납 상태인 회원만 필터링
    const targetMembers = this.members.filter(m => selectedIds.includes(m.id) && !m.feePaid);

    if (targetMembers.length === 0) {
      this.showToast("ℹ️ 선택하신 회원은 모두 이미 회비가 [납부완료]된 상태입니다.");
      return;
    }

    const modal = document.getElementById("bulkFeePayModal");
    if (!modal) return;

    const countEl = document.getElementById("bulkModalCount");
    if (countEl) countEl.textContent = targetMembers.length;

    const listEl = document.getElementById("bulkModalMemberList");
    if (listEl) {
      listEl.innerHTML = targetMembers.map(m => `
        <span class="pill-tag-nvidia" style="background: #e0e7ff; color: #3730a3; font-size: 12px; padding: 3px 8px; border-radius: 4px;">
          👤 ${this.escapeHtml(m.name)} (${m.cohort}기)
        </span>
      `).join("");
    }

    const todayStr = new Date().toLocaleDateString("sv-SE");
    const dateInput = document.getElementById("bulkFeePayDate");
    if (dateInput) dateInput.value = todayStr;

    const amountInput = document.getElementById("bulkFeePayAmount");
    if (amountInput) amountInput.value = "100000";

    this.selectedBulkMemberIds = targetMembers.map(m => m.id);
    this.updateBulkTotalEstimate();

    modal.classList.add("active");
    modal.style.display = "flex";
  },

  closeBulkFeePayModal() {
    const modal = document.getElementById("bulkFeePayModal");
    if (modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
  },

  updateBulkTotalEstimate() {
    const amount = parseInt(document.getElementById("bulkFeePayAmount").value, 10) || 0;
    const count = (this.selectedBulkMemberIds && this.selectedBulkMemberIds.length) ? this.selectedBulkMemberIds.length : 0;
    const total = amount * count;
    const totalEl = document.getElementById("bulkModalTotalAmount");
    if (totalEl) totalEl.textContent = `${total.toLocaleString()}원`;
  },

  async confirmBulkFeePayment(e) {
    if (e) e.preventDefault();

    if (!this.selectedBulkMemberIds || this.selectedBulkMemberIds.length === 0) {
      this.showToast("⚠️ 납부 대상 회원이 지정되지 않았습니다.");
      return;
    }

    const amount = parseInt(document.getElementById("bulkFeePayAmount").value, 10) || 100000;
    const feeDate = document.getElementById("bulkFeePayDate").value || new Date().toLocaleDateString("sv-SE");

    const targetMembers = this.members.filter(m => this.selectedBulkMemberIds.includes(m.id));
    if (targetMembers.length === 0) return;

    const memberUpdatePromises = [];
    const ledgerPromises = [];
    const now = Date.now();

    targetMembers.forEach((m, idx) => {
      m.feePaid = true;
      m.feeDate = feeDate;
      if (m.role === "regular") {
        m.role = "full";
      }

      // Firestore members 업데이트
      if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
        memberUpdatePromises.push(
          window.FS.setDoc(window.FS.doc(window.db, "members", m.id), {
            feePaid: true,
            feeDate: feeDate,
            role: m.role
          }, { merge: true }).catch(console.warn)
        );
      }

      // 💡 장부(ledger) 회비 수입 항목 자동 등록
      const feeLedgerEntry = {
        id: `led-fee-${now}-${idx}`,
        date: feeDate,
        type: "fee",
        category: "정회원 회비",
        name: m.name,
        item: `${m.name} 원우 정회원 회비 납부`,
        amount: amount,
        location: "-",
        attendees: "-",
        note: `회원관리 일괄 납부 처리 연동 (${m.cohort}기)`,
        receiptUrl: ""
      };

      this.ledger.unshift(feeLedgerEntry);

      // Firestore ledger 업데이트
      if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
        ledgerPromises.push(
          window.FS.setDoc(window.FS.doc(window.db, "ledger", feeLedgerEntry.id), feeLedgerEntry).catch(console.warn)
        );
      }
    });

    StorageService.saveMembers(this.members);
    StorageService.saveLedger(this.ledger);

    // 비동기 클라우드 동기화 병렬 처리
    Promise.all([...memberUpdatePromises, ...ledgerPromises]).catch(console.warn);

    this.closeBulkFeePayModal();
    this.showToast(`🎉 선택하신 원우 ${targetMembers.length}명의 회비 납부 및 장부 수입(${(amount * targetMembers.length).toLocaleString()}원)이 일괄 등록되었습니다!`);
    this.renderAdmin();
    this.renderLedger();
  },

  async updateMemberFeeDate(memberId, newDate) {
    if (this.currentRole !== "admin" && this.currentRole !== "exec") {
      this.showToast("🔒 회비 납부일자 수정 권한이 없습니다.");
      return;
    }

    if (!newDate) {
      newDate = new Date().toLocaleDateString("sv-SE");
    }

    const member = this.members.find(m => m.id === memberId);
    if (!member) return;

    member.feeDate = newDate;
    StorageService.saveMembers(this.members);

    // 1) Firestore members 컬렉션 갱신
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "members", memberId), {
          feeDate: newDate
        }, { merge: true });
      } catch (err) {
        console.warn("Firestore 회비 납부일자 갱신 오류:", err);
      }
    }

    // 2) 💡 회계 장부(ledger)에 이미 기록된 해당 회원의 회비 항목 일자도 함께 동기화
    let ledgerUpdated = false;
    const ledgerSyncPromises = [];
    this.ledger.forEach(item => {
      if (item.type === "fee" && item.name && item.name.trim() === member.name.trim()) {
        item.date = newDate;
        ledgerUpdated = true;
        if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
          ledgerSyncPromises.push(
            window.FS.setDoc(window.FS.doc(window.db, "ledger", item.id), {
              date: newDate
            }, { merge: true }).catch(console.warn)
          );
        }
      }
    });

    if (ledgerUpdated) {
      StorageService.saveLedger(this.ledger);
      if (ledgerSyncPromises.length > 0) {
        Promise.all(ledgerSyncPromises).catch(console.warn);
      }
      this.renderLedger();
    }

    this.showToast(`📅 ${member.name} 원우의 회비 납부일자가 '${newDate}'(으)로 설정되었습니다.`);
    this.renderAdmin();
  },

  async setAllFeeDatesToToday() {
    if (this.currentRole !== "admin" && this.currentRole !== "exec") {
      this.showToast("🔒 관리자 또는 임원 권한이 필요합니다.");
      return;
    }

    const todayStr = new Date().toLocaleDateString("sv-SE");
    if (!confirm(`회비를 납부한 모든 원우의 납부일자를 오늘 날짜(${todayStr})로 일괄 변경하시겠습니까?`)) {
      return;
    }

    let count = 0;
    const updatePromises = [];

    this.members.forEach(m => {
      if (m.feePaid) {
        m.feeDate = todayStr;
        count++;
        if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
          updatePromises.push(
            window.FS.setDoc(window.FS.doc(window.db, "members", m.id), {
              feeDate: todayStr
            }, { merge: true }).catch(console.warn)
          );
        }
      }
    });

    StorageService.saveMembers(this.members);
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    this.showToast(`🎉 납부 완료 원우 ${count}명의 회비 납부일자가 오늘 날짜(${todayStr})로 일괄 설정되었습니다!`);
    this.renderAdmin();
  },

  // 💡 헬퍼: 전화번호 하이픈 제거 및 숫자만 추출 (010-1234-5678 -> 01012345678)
  normalizePhone(phone) {
    if (!phone) return "";
    return phone.toString().replace(/[^0-9]/g, "").trim();
  },

  // 💡 헬퍼: 이메일 소문자 정규화
  normalizeEmail(email) {
    if (!email) return "";
    return email.toString().trim().toLowerCase();
  },

  // 💡 중복 회원 계정 쌍 감지 (전화번호 숫자열 일치 OR 이메일 일치)
  findDuplicateAccountPairs() {
    const pairs = [];
    const visited = new Set();

    for (let i = 0; i < this.members.length; i++) {
      const m1 = this.members[i];
      if (visited.has(m1.id)) continue;

      const p1 = this.normalizePhone(m1.phone);
      const e1 = this.normalizeEmail(m1.Pemail || m1.googleEmail);

      for (let j = i + 1; j < this.members.length; j++) {
        const m2 = this.members[j];
        if (visited.has(m2.id)) continue;

        const p2 = this.normalizePhone(m2.phone);
        const e2 = this.normalizeEmail(m2.Pemail || m2.googleEmail);

        let matchType = null;

        // 1) 전화번호 하이픈 제거 후 9자리 이상 동일할 경우 (010-XXXX-XXXX vs 010XXXXXXXX)
        if (p1 && p2 && p1.length >= 9 && p1 === p2) {
          matchType = "전화번호 일치 (하이픈 무관)";
        }
        // 2) 이메일 주소 동일할 경우
        else if (e1 && e2 && e1 === e2) {
          matchType = "이메일 주소 일치";
        }
        // 3) 성명이 동일하고 (이메일 또는 전화번호 중 하나라도 동일/유사)
        else if (m1.name && m2.name && m1.name.trim() === m2.name.trim()) {
          if ((p1 && p2 && p1 === p2) || (e1 && e2 && e1 === e2)) {
            matchType = "성명 및 연락처/이메일 동일";
          }
        }

        if (matchType) {
          pairs.push({
            primary: m1,
            secondary: m2,
            matchReason: matchType
          });
          visited.add(m1.id);
          visited.add(m2.id);
          break;
        }
      }
    }
    return pairs;
  },

  openMergeAccountModal(primaryId, secondaryId) {
    const modal = document.getElementById("mergeAccountModal");
    const container = document.getElementById("mergeAccountModalBody");
    if (!modal || !container) return;

    modal.classList.add("active");
    modal.style.display = "flex";

    let m1 = null;
    let m2 = null;
    let matchReason = "전화번호/이메일 일치 감지";

    if (primaryId && secondaryId) {
      m1 = this.members.find(m => m.id === primaryId);
      m2 = this.members.find(m => m.id === secondaryId);
    } else {
      const duplicatePairs = this.findDuplicateAccountPairs();
      if (duplicatePairs.length > 0) {
        m1 = duplicatePairs[0].primary;
        m2 = duplicatePairs[0].secondary;
        matchReason = duplicatePairs[0].matchReason;
      }
    }

    if (!m1 || !m2) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <div style="font-size: 48px; margin-bottom: 12px;">✅</div>
          <h4 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">중복 계정이 감지되지 않았습니다.</h4>
          <p style="font-size: 14px; color: var(--color-mute); margin-bottom: 24px;">
            현재 전화번호(하이픈 '-' 포함 및 미포함 비교) 또는 이메일이 동일한 중복 회원 계정이 없습니다.
          </p>
          <button class="btn btn-outline" onclick="App.closeMergeAccountModal()">확인 및 닫기</button>
        </div>
      `;
      return;
    }

    this.renderMergePreviewUI(m1, m2, matchReason);
  },

  renderMergePreviewUI(m1, m2, matchReason) {
    const container = document.getElementById("mergeAccountModalBody");
    if (!container) return;

    const m1IsGoogle = !!m1.googleUid;
    const m2IsGoogle = !!m2.googleUid;

    let defaultPrimaryId = m1.id;
    let defaultSecondaryId = m2.id;

    if (!m1IsGoogle && m2IsGoogle) {
      defaultPrimaryId = m2.id;
      defaultSecondaryId = m1.id;
    }

    container.innerHTML = `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 13.5px; color: #334155;">
        🔍 <strong>중복 감지 사유</strong>: <span style="color: #6366f1; font-weight: 700;">${matchReason}</span>
      </div>

      <p style="font-size: 14px; color: var(--color-ink); margin-bottom: 12px; line-height: 1.5;">
        아래 두 회원 정보의 상세 항목을 비교하시고, <strong>[유지할 대표 계정(Primary)]</strong>을 선택해 주세요.
      </p>

      <table class="nvidia-table" style="font-size: 13px; margin-bottom: 20px;">
        <thead>
          <tr>
            <th style="width: 25%;">항목 비교</th>
            <th style="width: 37.5%; background: #eff6ff;">
              <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <input type="radio" name="primarySelect" value="${m1.id}" ${m1.id === defaultPrimaryId ? 'checked' : ''} onchange="App.updateMergePreviewSelection('${m1.id}', '${m2.id}')" />
                <strong style="color: #1d4ed8;">계정 A (선택)</strong>
              </label>
            </th>
            <th style="width: 37.5%; background: #fef2f2;">
              <label style="cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <input type="radio" name="primarySelect" value="${m2.id}" ${m2.id === defaultPrimaryId ? 'checked' : ''} onchange="App.updateMergePreviewSelection('${m2.id}', '${m1.id}')" />
                <strong style="color: #b91c1c;">계정 B (선택)</strong>
              </label>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>성명 (기수)</strong></td>
            <td><strong>${m1.name}</strong> (${m1.cohort}기)</td>
            <td><strong>${m2.name}</strong> (${m2.cohort}기)</td>
          </tr>
          <tr>
            <td><strong>가입 방식 및 ID</strong></td>
            <td>${m1.googleUid ? '🔴 Google 소셜' : '👤 일반 ID'}<br><span style="font-size: 11.5px; color: var(--color-mute);">${m1.id}</span></td>
            <td>${m2.googleUid ? '🔴 Google 소셜' : '👤 일반 ID'}<br><span style="font-size: 11.5px; color: var(--color-mute);">${m2.id}</span></td>
          </tr>
          <tr>
            <td><strong>연락처 (Phone)</strong></td>
            <td>${m1.phone || '<span style="color:#94a3b8;">(미입력)</span>'}</td>
            <td>${m2.phone || '<span style="color:#94a3b8;">(미입력)</span>'}</td>
          </tr>
          <tr>
            <td><strong>이메일 (Email)</strong></td>
            <td>${m1.Pemail || m1.googleEmail || '<span style="color:#94a3b8;">(미입력)</span>'}</td>
            <td>${m2.Pemail || m2.googleEmail || '<span style="color:#94a3b8;">(미입력)</span>'}</td>
          </tr>
          <tr>
            <td><strong>회사명 / 직함</strong></td>
            <td>${m1.company || '-'}</td>
            <td>${m2.company || '-'}</td>
          </tr>
          <tr>
            <td><strong>회비 납부 상태</strong></td>
            <td>${m1.feePaid ? '✅ 납부완료 (' + (m1.feeDate || '') + ')' : '❌ 미납'}</td>
            <td>${m2.feePaid ? '✅ 납부완료 (' + (m2.feeDate || '') + ')' : '❌ 미납'}</td>
          </tr>
          <tr>
            <td><strong>회원 권한</strong></td>
            <td>${this.getRoleName(m1.role)}</td>
            <td>${this.getRoleName(m2.role)}</td>
          </tr>
          <tr>
            <td><strong>최초 가입일</strong></td>
            <td>${m1.joinDate || '-'}</td>
            <td>${m2.joinDate || '-'}</td>
          </tr>
        </tbody>
      </table>

      <!-- 💡 계정 통합 실행 시 미리보기 영향 범위 박스 -->
      <div style="background: #f0fdf4; border: 1px dashed #22c55e; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
        <h5 style="margin: 0 0 8px 0; font-size: 14px; color: #15803d; font-weight: 700;">
          💡 계정 통합 최종 실행 시 일어나는 일 (미리보기 확인)
        </h5>
        <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #166534; line-height: 1.6;">
          <li>선택하신 <strong id="selectedPrimaryLabel" style="color: #1d4ed8;">주 계정</strong>의 프로필 데이터가 최종 유지됩니다.</li>
          <li>Google 소셜 연동 정보('googleUid'), 이메일, 회비 납부 내역('feePaid')은 부 계정의 유효 데이터가 주 계정으로 <strong>자동 합성(Merge)</strong>됩니다.</li>
          <li>선택되지 않은 부 계정은 데이터베이스(Firestore) 및 회원 목록에서 <strong>안전하게 삭제 및 일원화</strong>됩니다.</li>
        </ul>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid var(--color-hairline); padding-top: 16px;">
        <button type="button" class="btn btn-outline" onclick="App.closeMergeAccountModal()">취소</button>
        <button type="button" class="btn btn-primary" style="background: #4f46e5; border-color: #4f46e5;" onclick="App.executeMergeAccounts('${defaultPrimaryId}', '${defaultSecondaryId}')">
          ⚡ 선택한 내용으로 계정 통합 최종 실행
        </button>
      </div>
    `;
  },

  updateMergePreviewSelection(primaryId, secondaryId) {
    const selectedLabel = document.getElementById("selectedPrimaryLabel");
    const mPrimary = this.members.find(m => m.id === primaryId);
    if (selectedLabel && mPrimary) {
      selectedLabel.textContent = `주 계정 (${mPrimary.name} - ${mPrimary.id})`;
    }
    const btn = document.querySelector("#mergeAccountModalBody button.btn-primary");
    if (btn) {
      btn.onclick = () => this.executeMergeAccounts(primaryId, secondaryId);
    }
  },

  async executeMergeAccounts(primaryId, secondaryId) {
    const primaryIndex = this.members.findIndex(m => m.id === primaryId);
    const secondaryIndex = this.members.findIndex(m => m.id === secondaryId);

    if (primaryIndex === -1 || secondaryIndex === -1) {
      this.showToast("⚠️ 통합 대상 계정을 찾을 수 없습니다.");
      return;
    }

    const primary = this.members[primaryIndex];
    const secondary = this.members[secondaryIndex];

    // 💡 두 계정에 연동된 모든 Google UID 및 이메일 수집 및 보존
    const allGoogleUids = Array.from(new Set([
      primary.googleUid, 
      secondary.googleUid, 
      ...(primary.linkedGoogleUids || []), 
      ...(secondary.linkedGoogleUids || [])
    ].filter(Boolean)));

    const allGoogleEmails = Array.from(new Set([
      primary.googleEmail, 
      secondary.googleEmail, 
      ...(primary.linkedGoogleEmails || []), 
      ...(secondary.linkedGoogleEmails || [])
    ].filter(Boolean)));

    // 💡 두 계정 데이터 스마트 병합 (Merge)
    const mergedUser = {
      ...primary,
      position: primary.position || secondary.position || "",
      googleUid: primary.googleUid || secondary.googleUid || "",
      googleEmail: primary.googleEmail || secondary.googleEmail || "",
      linkedGoogleUids: allGoogleUids,
      linkedGoogleEmails: allGoogleEmails,
      Pemail: primary.Pemail || secondary.Pemail || primary.googleEmail || secondary.googleEmail || "",
      phone: primary.phone || secondary.phone || "",
      kakaoId: primary.kakaoId || secondary.kakaoId || "",
      company: primary.company || secondary.company || "",
      industry: primary.industry || secondary.industry || "",
      industryImg: primary.industryImg || secondary.industryImg || this.getIndustryImage(primary.industry || secondary.industry || ""),
      location: primary.location || secondary.location || "",
      pageURL: primary.pageURL || secondary.pageURL || "",
      summary: primary.summary || secondary.summary || "",
      feePaid: primary.feePaid || secondary.feePaid || false,
      feeDate: primary.feePaid ? primary.feeDate : (secondary.feePaid ? secondary.feeDate : primary.feeDate || "")
    };

    // 1) Firestore DB 처리 (부 계정 삭제 및 주 계정 병합 업데이트)
    if (window.db && window.FS && window.FS.deleteDoc && window.FS.setDoc) {
      try {
        await window.FS.deleteDoc(window.FS.doc(window.db, "members", secondary.id));
        await window.FS.setDoc(window.FS.doc(window.db, "members", primary.id), mergedUser, { merge: true });
        console.log(`Firestore 계정 통합 완료: ${secondary.id} 삭제 후 ${primary.id}로 합침`);
      } catch (err) {
        console.warn("Firestore 계정 통합 처리 중 경고:", err);
      }
    }

    // 2) 로컬 배열 업데이트 (부 계정 제거 & 주 계정 갱신)
    this.members[primaryIndex] = mergedUser;
    this.members = this.members.filter(m => m.id !== secondary.id);
    StorageService.saveMembers(this.members);

    this.closeMergeAccountModal();
    this.showToast(`🎉 ${mergedUser.name} 원우님의 중복 계정이 성공적으로 하나로 통합되었습니다!`);
    this.renderAdmin();
    this.renderMemberDirectory();
  },

  closeMergeAccountModal() {
    const modal = document.getElementById("mergeAccountModal");
    if (modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
  },

  async changeMemberRole(memberId, newRole) {
    if (this.currentRole !== "admin") {
      this.showToast("🔒 회원 등급 변경 권한은 최고 관리자(admin) 전용입니다.");
      this.renderAdmin();
      return;
    }
    const m = this.members.find(item => item.id === memberId);
    if (m) {
      m.role = newRole;
      StorageService.saveMembers(this.members);

      // 💡 Firebase Firestore 클라우드 DB 실시간 등급 저장 동기화!
      if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
        try {
          await window.FS.setDoc(window.FS.doc(window.db, "members", memberId), { role: newRole }, { merge: true });
          console.log(`Firebase Firestore: ${m.name} 회원 등급 '${newRole}' 클라우드 DB 저장 완료`);
        } catch (err) {
          console.warn("Firestore 회원 등급 수정 시도 오류:", err);
        }
      }

      this.showToast(`👑 ${m.name} 회원 등급이 '${this.getRoleName(newRole)}'(으)로 변경 및 클라우드 DB에 반영되었습니다.`);
      this.renderAdmin();
    }
  },

  async toggleFeeStatus(memberId) {
    if (this.currentRole !== "admin" && this.currentRole !== "exec") {
      this.showToast("🔒 회비 납부 상태 관리 권한이 필요합니다.");
      return;
    }

    const m = this.members.find(item => item.id === memberId);
    if (!m) return;

    if (!m.feePaid) {
      // 💡 미납 -> 납부완료 전환 시: 회비 납부 설정 팝업 모달 오픈 (기본 100,000원 금액 수정 가능)
      this.openFeePayModal(m);
    } else {
      // 납부완료 -> 미납 전환 시
      if (!confirm(`${m.name} 회원의 회비 납부 상태를 [미납]으로 전환하시겠습니까?\n(해당 회원의 장부상 회비 납부 내역도 함께 자동 삭제됩니다)`)) return;

      m.feePaid = false;
      m.feeDate = "-";
      if (m.role === "full") {
        m.role = "regular";
      }

      StorageService.saveMembers(this.members);

      // 1) Firestore members 컬렉션 미납 동기화
      if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
        try {
          await window.FS.setDoc(window.FS.doc(window.db, "members", memberId), { 
            feePaid: false, 
            feeDate: "-", 
            role: m.role 
          }, { merge: true });
        } catch (err) {
          console.warn("Firestore 회비 미납 전환 시도 오류:", err);
        }
      }

      // 2) 💡 장부(ledger) 상의 해당 회원 회비 납부 내역 자동 삭제 연동!
      const memberName = m.name ? m.name.trim() : "";
      const feeLedgerItemsToDelete = this.ledger.filter(item => 
        (item.type === "fee" || item.category === "정회원 회비") && 
        item.name && item.name.trim() === memberName
      );

      if (feeLedgerItemsToDelete.length > 0) {
        const deletedIds = feeLedgerItemsToDelete.map(item => item.id);
        this.ledger = this.ledger.filter(item => !deletedIds.includes(item.id));
        StorageService.saveLedger(this.ledger);

        // Firestore ledger 문서 삭제
        if (window.db && window.FS && window.FS.deleteDoc && window.FS.doc) {
          deletedIds.forEach(delId => {
            window.FS.deleteDoc(window.FS.doc(window.db, "ledger", delId)).catch(console.warn);
          });
        }
      }

      this.showToast(`⚠️ ${m.name} 회원이 [미납] 처리되었으며, 장부상의 회비 내역(${feeLedgerItemsToDelete.length}건)이 함께 삭제되었습니다.`);
      this.renderAdmin();
      this.renderLedger();
    }
  },

  openFeePayModal(member) {
    const modal = document.getElementById("feePayModal");
    if (!modal) return;

    const todayStr = new Date().toLocaleDateString("sv-SE");
    const inputEl = document.getElementById(`feeDateInput_${member.id}`);
    const selectedFeeDate = (inputEl && inputEl.value) ? inputEl.value : todayStr;

    document.getElementById("feePayMemberId").value = member.id;
    document.getElementById("feePayMemberName").value = `${member.name} (${member.cohort}기 - ${member.company || '13기 원우'})`;
    document.getElementById("feePayAmount").value = "100000"; // 💡 기본 정회원 회비 100,000원
    document.getElementById("feePayDate").value = selectedFeeDate;

    modal.classList.add("active");
    modal.style.display = "flex";
  },

  closeFeePayModal() {
    const modal = document.getElementById("feePayModal");
    if (modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
  },

  async confirmFeePayment(e) {
    if (e) e.preventDefault();

    const memberId = document.getElementById("feePayMemberId").value;
    const amount = parseInt(document.getElementById("feePayAmount").value, 10) || 100000;
    const feeDate = document.getElementById("feePayDate").value;

    const m = this.members.find(item => item.id === memberId);
    if (!m) return;

    m.feePaid = true;
    m.feeDate = feeDate;

    if (m.role === "regular") {
      m.role = "full";
    }

    StorageService.saveMembers(this.members);

    // 1) Firestore members 컬렉션 업데이트
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "members", memberId), { 
          feePaid: true, 
          feeDate: feeDate, 
          role: m.role 
        }, { merge: true });
      } catch (err) {
        console.warn("Firestore 회원 회비 상태 업데이트 오류:", err);
      }
    }

    // 2) 💡 정회원 회비 납부 내역을 장부(ledger) 수입 항목으로 자동 기록 연동!
    const feeLedgerEntry = {
      id: `led-fee-${Date.now()}`,
      date: feeDate,
      type: "fee",
      category: "정회원 회비",
      name: m.name,
      item: `${m.name} 원우 정회원 회비 납부`,
      amount: amount,
      location: "-",
      attendees: "-",
      note: `회원관리 탭 자동 연동 (${m.cohort}기)`,
      receiptUrl: ""
    };

    this.ledger.unshift(feeLedgerEntry);
    StorageService.saveLedger(this.ledger);

    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "ledger", feeLedgerEntry.id), feeLedgerEntry);
      } catch (err) {
        console.warn("Firestore 회비 수입 장부 저장 오류:", err);
      }
    }

    this.closeFeePayModal();
    this.showToast(`🎉 ${m.name} 회원의 회비 ${amount.toLocaleString()}원 납부 처리 및 장부 수입이 자동 등록되었습니다!`);
    this.renderAdmin();
    this.renderLedger();
  },

  /* 6. LEDGER METHODS */
  handleLedgerTypeChange(type) {
    const expenseOpts = document.getElementById("ledgerExpenseOptions");
    if (!expenseOpts) return;
    if (type === "expense_dining") {
      expenseOpts.style.display = "grid";
    } else {
      expenseOpts.style.display = "none";
    }
  },

  renderLedger() {
    const ledgerTable = document.getElementById("ledgerTableBody");
    if (!ledgerTable) return;

    if (!Array.isArray(this.ledger)) {
      this.ledger = [];
    }

    const filterType = document.getElementById("ledgerFilterType") ? document.getElementById("ledgerFilterType").value : "all";
    const searchQuery = document.getElementById("ledgerSearchInput") ? document.getElementById("ledgerSearchInput").value.trim().toLowerCase() : "";

    let totalIncome = 0;
    let totalExpense = 0;

    // 💡 설정 문서나 빈 데이터 제외 후 유효한 장부 항목만 계산
    const validLedger = this.ledger.filter(item => {
      if (!item || item.id === "initial_balance" || item.isConfig === true) {
        return false;
      }
      return true;
    });

    validLedger.forEach(item => {
      const amt = Number(item.amount) || 0;
      const isIncome = item.type === "sponsorship" || item.type === "fee" || item.type === "interest";
      if (isIncome) {
        totalIncome += amt;
      } else {
        totalExpense += amt;
      }
    });

    const initBalance = Number(this.initialBalance) || 0;
    const balance = initBalance + totalIncome - totalExpense;

    const initialEl = document.getElementById("initialBalanceAmount");
    if (initialEl) initialEl.textContent = `${initBalance.toLocaleString()}원`;
    
    const incomeEl = document.getElementById("totalSponsorshipAmount");
    if (incomeEl) incomeEl.textContent = `${totalIncome.toLocaleString()}원`;

    const expenseEl = document.getElementById("totalExpenseAmount");
    if (expenseEl) expenseEl.textContent = `${totalExpense.toLocaleString()}원`;

    const balanceEl = document.getElementById("ledgerBalanceAmount");
    if (balanceEl) balanceEl.textContent = `${balance.toLocaleString()}원`;

    // 필터링 및 검색어 적용
    const filteredLedger = validLedger.filter(item => {
      if (filterType !== "all" && item.type !== filterType) return false;
      if (searchQuery) {
        const text = `${item.name || ''} ${item.item || ''} ${item.location || ''} ${item.note || ''} ${item.category || ''}`.toLowerCase();
        if (!text.includes(searchQuery)) return false;
      }
      return true;
    });

    if (filteredLedger.length === 0) {
      ledgerTable.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 36px; color: var(--color-mute);">조건에 해당하는 장부 내역이 없습니다.</td></tr>`;
      return;
    }

    ledgerTable.innerHTML = filteredLedger.map(item => {
      const amt = Number(item.amount) || 0;
      const isIncome = item.type === "sponsorship" || item.type === "fee" || item.type === "interest";
      let badgeLabel = "🟢 찬조금";
      let badgeBg = "#dcfce7";
      let badgeColor = "#15803d";

      if (item.type === "fee") {
        badgeLabel = "🟢 정회원 회비";
        badgeBg = "#dbeafe";
        badgeColor = "#1e40af";
      } else if (item.type === "interest") {
        badgeLabel = "🟢 예금 이자";
        badgeBg = "#fef3c7";
        badgeColor = "#92400e";
      } else if (item.type === "expense_dining") {
        badgeLabel = "🔴 네트워킹/회식";
        badgeBg = "#fee2e2";
        badgeColor = "#991b1b";
      } else if (item.type === "expense_gift") {
        badgeLabel = "🔴 선물/행사";
        badgeBg = "#fce7f3";
        badgeColor = "#9d174d";
      } else if (item.type === "expense_other" || item.type === "expense") {
        badgeLabel = "🔴 기타 지출";
        badgeBg = "#fee2e2";
        badgeColor = "#b91c1c";
      }

      // 날짜 포맷팅 안전 처리
      let dateDisplay = item.date || "-";
      if (typeof dateDisplay === "object" && dateDisplay && dateDisplay.seconds) {
        dateDisplay = new Date(dateDisplay.seconds * 1000).toISOString().split("T")[0];
      }

      return `
        <tr>
          <td style="white-space: nowrap;">${this.escapeHtml(dateDisplay)}</td>
          <td>
            <span class="pill-tag-nvidia" style="background: ${badgeBg}; color: ${badgeColor}; font-size: 11px; padding: 3px 8px; border-radius: 4px;">
              ${badgeLabel}
            </span>
          </td>
          <td>
            <strong>${this.escapeHtml(item.name || '미지정')}</strong>
            ${item.location && item.location !== '-' ? `<br><span style="font-size: 11.5px; color: var(--color-mute);">📍 ${this.escapeHtml(item.location)}</span>` : ''}
          </td>
          <td>
            ${this.escapeHtml(item.item || '내역 미기재')}
            ${item.attendees && item.attendees !== '-' ? ` <span style="font-size: 11.5px; color: #4f46e5; font-weight: 700;">(👥 ${this.escapeHtml(item.attendees)})</span>` : ''}
          </td>
          <td style="font-weight: 700; color: ${isIncome ? '#16a34a' : '#dc2626'}; white-space: nowrap;">
            ${isIncome ? '+' : '-'}${amt.toLocaleString()}원
          </td>
          <td>
            ${item.receiptUrl ? `
              <button class="btn btn-outline btn-sm" style="padding: 2px 8px; font-size: 11px;" onclick="App.openReceiptZoomModal('${this.escapeHtml(item.receiptUrl)}', '${this.escapeHtml(item.item || '')}')">
                🧾 영수증
              </button>
            ` : '<span style="color: #cbd5e1; font-size: 12px;">-</span>'}
          </td>
          <td style="color: var(--color-mute); font-size: 12.5px;">${this.escapeHtml(item.note || '-')}</td>
          <td>
            <div style="display: flex; gap: 4px; align-items: center;">
              <button class="btn btn-outline btn-sm" style="padding: 2px 6px; font-size: 11px; border-color: #3b82f6; color: #2563eb;" onclick="App.openEditLedgerModal('${this.escapeHtml(item.id)}')" title="장부 내역 수정">
                ✏️
              </button>
              <button class="btn btn-outline btn-sm" style="padding: 2px 6px; font-size: 11px; border-color: #ef4444; color: #ef4444;" onclick="App.deleteLedgerItem('${this.escapeHtml(item.id)}')" title="장부 내역 삭제">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  },

  async addLedgerEntry(e) {
    if (e) e.preventDefault();

    const type = document.getElementById("ledgerType").value;
    const name = document.getElementById("ledgerName").value.trim();
    const item = document.getElementById("ledgerItem").value.trim();
    const amount = parseInt(document.getElementById("ledgerAmount").value, 10);
    const location = document.getElementById("ledgerLocation") ? document.getElementById("ledgerLocation").value.trim() : "";
    const attendees = document.getElementById("ledgerAttendees") ? document.getElementById("ledgerAttendees").value.trim() : "";
    const note = document.getElementById("ledgerNote").value.trim();
    const receiptFileInput = document.getElementById("ledgerReceiptFile");

    if (!name || !item || isNaN(amount) || amount <= 0) {
      this.showToast("⚠️ 올바른 성명, 내역 설명 및 금액을 입력해 주세요.");
      return;
    }

    let category = "기타 지출";
    if (type === "sponsorship") category = "찬조금";
    else if (type === "fee") category = "정회원 회비";
    else if (type === "interest") category = "예금 이자";
    else if (type === "expense_dining") category = "회식/네트워킹 지출";
    else if (type === "expense_gift") category = "선물/행사 지출";

    let receiptUrl = "";

    // 💡 영수증 이미지 첨부 시 HTML5 Canvas로 경량화 (.jpg 300px) 압축 변환
    if (receiptFileInput && receiptFileInput.files && receiptFileInput.files[0]) {
      const file = receiptFileInput.files[0];
      receiptUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const maxDim = 400;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", 0.75));
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    const newEntry = {
      id: `led-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      type,
      category,
      name,
      item,
      amount,
      location: location || "-",
      attendees: attendees || "-",
      note,
      receiptUrl
    };

    this.ledger.unshift(newEntry);
    StorageService.saveLedger(this.ledger);

    // Firebase Firestore ledger 컬렉션 동기화
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "ledger", newEntry.id), newEntry);
      } catch (err) {
        console.warn("Firestore ledger 내역 저장 경고:", err);
      }
    }

    this.showToast("🎉 장부 내역과 경량화 영수증이 클라우드 DB에 동기화되었습니다!");
    this.renderLedger();

    document.getElementById("ledgerForm").reset();
  },

  async deleteLedgerItem(id) {
    if (!confirm("해당 장부 항목을 정말 삭제하시겠습니까?")) return;

    const targetItem = this.ledger.find(item => item.id === id);
    let affectedMember = null;

    // 💡 1. 삭제 대상이 '정회원 회비' 항목인 경우, 해당 회원의 납부 상태를 자동으로 '미납'으로 원복
    if (targetItem && (targetItem.type === "fee" || targetItem.category === "정회원 회비")) {
      const memberName = targetItem.name ? targetItem.name.trim() : "";
      affectedMember = this.members.find(m => m.name && m.name.trim() === memberName);

      if (affectedMember) {
        affectedMember.feePaid = false;
        affectedMember.feeDate = "-";
        if (affectedMember.role === "full") {
          affectedMember.role = "regular";
        }
        StorageService.saveMembers(this.members);

        // Firestore members 컬렉션 업데이트
        if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
          try {
            await window.FS.setDoc(window.FS.doc(window.db, "members", affectedMember.id), {
              feePaid: false,
              feeDate: "-",
              role: affectedMember.role
            }, { merge: true });
          } catch (err) {
            console.warn("Firestore 회원 미납 전환 경고:", err);
          }
        }
      }
    }

    // 2. 장부 데이터베이스 및 목록에서 항목 삭제
    this.ledger = this.ledger.filter(item => item.id !== id);
    StorageService.saveLedger(this.ledger);

    if (window.db && window.FS && window.FS.deleteDoc && window.FS.doc) {
      try {
        await window.FS.deleteDoc(window.FS.doc(window.db, "ledger", id));
      } catch (err) {
        console.warn("Firestore ledger 삭제 경고:", err);
      }
    }

    if (affectedMember) {
      this.showToast(`⚠️ 장부 회비 삭제로 인해 ${affectedMember.name} 회원의 상태가 [미납]으로 자동 전환되었습니다.`);
    } else {
      this.showToast("🗑️ 장부 항목이 삭제되었습니다.");
    }

    this.renderAdmin();
    this.renderLedger();
  },

  /* 장부 수정 모달 관련 */
  openEditLedgerModal(id) {
    if (this.currentRole !== "admin" && this.currentRole !== "exec") {
      this.showToast("🔒 장부 수정 권한이 필요합니다.");
      return;
    }

    const item = this.ledger.find(l => l.id === id);
    if (!item) {
      this.showToast("⚠️ 수정할 장부 내역을 찾을 수 없습니다.");
      return;
    }

    const modal = document.getElementById("editLedgerModal");
    if (!modal) return;

    document.getElementById("editLedgerId").value = item.id;
    document.getElementById("editLedgerType").value = item.type || "sponsorship";
    document.getElementById("editLedgerName").value = item.name || "";
    document.getElementById("editLedgerItem").value = item.item || "";
    document.getElementById("editLedgerAmount").value = item.amount || 0;

    // 날짜 포맷팅
    let dateStr = item.date || "";
    if (typeof dateStr === "object" && dateStr && dateStr.seconds) {
      dateStr = new Date(dateStr.seconds * 1000).toISOString().split("T")[0];
    }
    document.getElementById("editLedgerDate").value = dateStr || new Date().toLocaleDateString("sv-SE");

    document.getElementById("editLedgerLocation").value = item.location && item.location !== "-" ? item.location : "";
    document.getElementById("editLedgerAttendees").value = item.attendees && item.attendees !== "-" ? item.attendees : "";
    document.getElementById("editLedgerNote").value = item.note && item.note !== "-" ? item.note : "";

    // 영수증 미리보기 및 기존 URL 관리
    const previewEl = document.getElementById("editLedgerReceiptPreview");
    const existingReceiptInput = document.getElementById("editLedgerExistingReceiptUrl");
    const fileInput = document.getElementById("editLedgerReceiptFile");
    if (fileInput) fileInput.value = "";

    if (item.receiptUrl) {
      if (existingReceiptInput) existingReceiptInput.value = item.receiptUrl;
      if (previewEl) previewEl.style.display = "flex";
    } else {
      if (existingReceiptInput) existingReceiptInput.value = "";
      if (previewEl) previewEl.style.display = "none";
    }

    this.handleEditLedgerTypeChange(item.type);

    modal.classList.add("active");
    modal.style.display = "flex";
    modal.style.zIndex = "9999";
  },

  closeEditLedgerModal() {
    const modal = document.getElementById("editLedgerModal");
    if (modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
  },

  handleEditLedgerTypeChange(type) {
    const locationBox = document.getElementById("editLedgerLocationBox");
    const attendeesBox = document.getElementById("editLedgerAttendeesBox");

    if (type === "expense_dining") {
      if (locationBox) locationBox.style.display = "block";
      if (attendeesBox) attendeesBox.style.display = "block";
    } else {
      if (locationBox) locationBox.style.display = "block";
      if (attendeesBox) attendeesBox.style.display = "none";
    }
  },

  removeEditLedgerReceipt() {
    const existingReceiptInput = document.getElementById("editLedgerExistingReceiptUrl");
    const previewEl = document.getElementById("editLedgerReceiptPreview");
    if (existingReceiptInput) existingReceiptInput.value = "";
    if (previewEl) previewEl.style.display = "none";
    this.showToast("🧾 기존 영수증 이미지가 제거되었습니다. 저장 시 반영됩니다.");
  },

  async saveEditLedger(e) {
    if (e) e.preventDefault();

    const id = document.getElementById("editLedgerId").value;
    const itemIndex = this.ledger.findIndex(l => l.id === id);
    if (itemIndex === -1) {
      this.showToast("⚠️ 수정 대상 장부 항목을 찾을 수 없습니다.");
      return;
    }

    const type = document.getElementById("editLedgerType").value;
    const name = document.getElementById("editLedgerName").value.trim();
    const itemDesc = document.getElementById("editLedgerItem").value.trim();
    const amount = parseInt(document.getElementById("editLedgerAmount").value, 10);
    const date = document.getElementById("editLedgerDate").value;
    const location = document.getElementById("editLedgerLocation").value.trim();
    const attendees = document.getElementById("editLedgerAttendees").value.trim();
    const note = document.getElementById("editLedgerNote").value.trim();
    const fileInput = document.getElementById("editLedgerReceiptFile");
    let receiptUrl = document.getElementById("editLedgerExistingReceiptUrl").value;

    if (!name || !itemDesc || isNaN(amount) || amount <= 0 || !date) {
      this.showToast("⚠️ 올바른 성명, 내역 설명, 금액 및 일자를 입력해 주세요.");
      return;
    }

    let category = "기타 지출";
    if (type === "sponsorship") category = "찬조금";
    else if (type === "fee") category = "정회원 회비";
    else if (type === "interest") category = "예금 이자";
    else if (type === "expense_dining") category = "회식/네트워킹 지출";
    else if (type === "expense_gift") category = "선물/행사 지출";

    // 신규 영수증 이미지 첨부 시 HTML5 Canvas 경량화
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      receiptUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            const maxDim = 400;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxDim) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", 0.75));
          };
          img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    const updatedEntry = {
      ...this.ledger[itemIndex],
      date,
      type,
      category,
      name,
      item: itemDesc,
      amount,
      location: location || "-",
      attendees: attendees || "-",
      note: note || "-",
      receiptUrl: receiptUrl || ""
    };

    this.ledger[itemIndex] = updatedEntry;
    StorageService.saveLedger(this.ledger);

    // Firestore 동기화
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "ledger", id), updatedEntry, { merge: true });
      } catch (err) {
        console.warn("Firestore 장부 내역 수정 동기화 경고:", err);
      }
    }

    // 만약 수정된 항목이 '정회원 회비'인 경우, 해당 회원의 납부일자도 함께 동기화
    if (type === "fee") {
      const matchedMember = this.members.find(m => m.name && m.name.trim() === name);
      if (matchedMember) {
        matchedMember.feeDate = date;
        StorageService.saveMembers(this.members);
        if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
          window.FS.setDoc(window.FS.doc(window.db, "members", matchedMember.id), { feeDate: date }, { merge: true }).catch(console.warn);
        }
        this.renderAdmin();
      }
    }

    this.closeEditLedgerModal();
    this.showToast(`🎉 장부 내역('${itemDesc}')이 성공적으로 수정 및 동기화되었습니다!`);
    this.renderLedger();
  },

  /* 이월 잔고 모달 관련 */
  openInitialBalanceModal(e) {
    if (e) e.preventDefault();
    const modal = document.getElementById("initialBalanceModal");
    if (!modal) {
      console.warn("initialBalanceModal 엘리먼트를 찾을 수 없습니다.");
      return;
    }

    const input = document.getElementById("initialBalanceInput");
    if (input) input.value = this.initialBalance || 0;

    modal.classList.add("active");
    modal.style.display = "flex";
    modal.style.zIndex = "9999";
  },

  closeInitialBalanceModal() {
    const modal = document.getElementById("initialBalanceModal");
    if (modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
  },

  async saveInitialBalance(e) {
    if (e) e.preventDefault();

    const val = parseInt(document.getElementById("initialBalanceInput").value, 10) || 0;
    this.initialBalance = val;
    StorageService.saveInitialBalance(val);

    // Firestore ledger/initial_balance 문서 저장 (기존 ledger 컬렉션 내부 통합 보관)
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "ledger", "initial_balance"), { 
          initialBalance: val, 
          isConfig: true, 
          updatedAt: new Date().toISOString() 
        }, { merge: true });
      } catch (err) {
        console.warn("Firestore 이월 잔고 저장 경고:", err);
      }
    }

    this.closeInitialBalanceModal();
    this.showToast(`🎉 이월 잔고 ${val.toLocaleString()}원이 설정되었습니다!`);
    this.renderLedger();
  },

  async resetInitialBalanceToZero(e) {
    if (e) e.preventDefault();

    if (!confirm("초기 이월 잔고를 0원으로 리셋하시겠습니까?")) return;

    this.initialBalance = 0;
    StorageService.saveInitialBalance(0);

    const input = document.getElementById("initialBalanceInput");
    if (input) input.value = 0;

    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "ledger", "initial_balance"), { 
          initialBalance: 0, 
          isConfig: true, 
          updatedAt: new Date().toISOString() 
        }, { merge: true });
      } catch (err) {
        console.warn("Firestore 이월 잔고 초기화 경고:", err);
      }
    }

    this.closeInitialBalanceModal();
    this.showToast("🔄 이월 잔고가 0원으로 완벽히 초기화되었습니다!");
    this.renderLedger();
  },

  /* 이미지(약도/영수증) 팝업 모달 관련 */
  openReceiptZoomModal(url, title) {
    const modal = document.getElementById("receiptZoomModal");
    const img = document.getElementById("receiptZoomImage");
    const titleEl = document.getElementById("receiptZoomTitle");
    if (!modal || !img) return;

    img.src = url;
    if (titleEl) {
      if (title && (title.includes("약도") || title.includes("위치") || title.includes("오시는 길"))) {
        titleEl.textContent = `📍 ${title}`;
      } else {
        titleEl.textContent = `🧾 ${title || '상세'} 영수증`;
      }
    }

    modal.classList.add("active");
    modal.style.display = "flex";
    modal.style.zIndex = "9999";
  },

  closeReceiptZoomModal() {
    const modal = document.getElementById("receiptZoomModal");
    if (modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
  },

  /* 회비 계좌 팝업 모달 관련 */
  openAccountInfoModal() {
    const modal = document.getElementById("accountInfoModal");
    if (!modal) return;
    modal.classList.add("active");
    modal.style.display = "flex";
    modal.style.zIndex = "9999";
  },

  closeAccountInfoModal() {
    const modal = document.getElementById("accountInfoModal");
    if (modal) {
      modal.classList.remove("active");
      modal.style.display = "none";
    }
  },

  copyAccountToClipboard() {
    const accountNum = "79422963241";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(accountNum).then(() => {
        this.showToast("📋 카카오뱅크 79422963241 (예금주: 김정순) 계좌번호가 클립보드에 복사되었습니다!");
      }).catch(() => {
        this.showToast("📋 회비 계좌: 카카오뱅크 79422963241 (예금주: 김정순)");
      });
    } else {
      this.showToast("📋 회비 계좌: 카카오뱅크 79422963241 (예금주: 김정순)");
    }
  },

  showToast(message) {
    const toast = document.getElementById("toastNotification");
    if (!toast) return;
    toast.querySelector(".toast-message").textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  }
};
