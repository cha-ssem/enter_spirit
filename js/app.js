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
  ledger: [],
  currentUserId: "mem-1301",

  init() {
    this.members = StorageService.getMembers();
    this.lectures = StorageService.getLectures();
    this.ledger = StorageService.getLedger();

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

    // 💡 Firebase Firestore 클라우드 DB의 최신 회원 데이터 및 강의 커리큘럼 데이터 비동기 동기화
    setTimeout(() => {
      this.fetchCloudMembers();
      this.fetchCloudLectures();
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
        cloudMembers.push({ ...data, id: docSnap.id || data.id });
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
          <div class="stat-label-nvidia">FEE PAID</div>
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
      const matchSearch = m.name.toLowerCase().includes(searchVal) || m.company.toLowerCase().includes(searchVal);
      const matchIndustry = industryVal === "all" || m.industry === industryVal;
      const matchCohort = cohortVal === "all" || String(m.cohort) === String(cohortVal);
      return matchSearch && matchIndustry && matchCohort;
    });

    filtered.sort((a, b) => {
      if (sortVal === "name") return a.name.localeCompare(b.name, "ko");
      if (sortVal === "company") return a.company.localeCompare(b.company, "ko");
      if (sortVal === "cohort") return b.cohort - a.cohort;
      if (sortVal === "joinDate") return new Date(b.joinDate) - new Date(a.joinDate);
      return 0;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--color-mute);">검색 조건에 해당하는 회원 정보가 없습니다.</div>`;
      return;
    }

    container.innerHTML = filtered.map(m => `
      <div class="product-card">
        <span class="corner-square"></span>
        <div>
          <div style="display: flex; gap: 14px; margin-bottom: 14px;">
            <img src="${m.avatarUrl}" alt="${m.name}" style="width: 54px; height: 54px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid var(--color-hairline);" />
            <div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-size: 18px; font-weight: 700; line-height: 1;">${m.name}</span>
                <span class="pill-tag-nvidia" style="background: var(--color-surface-dark); color: #fff; height: 22px; padding: 0 8px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;">${m.cohort}기</span>
                <span class="pill-tag-nvidia" style="background: var(--color-surface-soft); color: var(--color-ink); border: 1px solid var(--color-hairline); height: 22px; padding: 0 8px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;">${this.getRoleName(m.role)}</span>
                ${m.pageURL && m.pageURL.trim() !== '' ? `
                  <a href="${m.pageURL.startsWith('http') ? m.pageURL : 'https://' + m.pageURL}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="height: 22px; min-height: 22px; padding: 0 9px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; gap: 3px; border-radius: 4px; box-sizing: border-box; line-height: 1;">
                    🌐 홈페이지 방문 →
                  </a>
                ` : ''}
              </div>
              ${m.company ? `<div style="font-size: 14px; font-weight: 700; color: var(--color-ink); margin-top: 2px;">${m.company}</div>` : ''}
              ${m.industry ? `
                <div style="font-size: 12.5px; margin-top: 2px; color: var(--color-mute);">
                  ${m.industryIcon || ''} ${m.industry}
                </div>
              ` : ''}
            </div>
          </div>
          ${m.summary ? `<p style="font-size: 14.5px; color: var(--color-body); margin: 12px 0; line-height: 1.5;">${m.summary}</p>` : ''}
        </div>

        <div style="border-top: 1px solid var(--color-hairline); padding-top: 12px; font-size: 13.5px; color: var(--color-mute); display: flex; flex-direction: column; gap: 4px;">
          ${m.location ? `<div>📍 ${m.location}</div>` : ''}
          ${m.phone ? `<div>📞 ${m.phone}</div>` : ''}
          ${m.kakaoId ? `<div>💬 카톡: <strong style="color: var(--color-ink);">${m.kakaoId}</strong></div>` : ''}
          ${(m.Pemail || m.googleEmail) ? `<div>📧 이메일: <strong style="color: var(--color-ink);">${m.Pemail || m.googleEmail}</strong></div>` : ''}
        </div>
      </div>
    `).join("");
  },

  /* 3. SCHEDULE TAB */
  renderSchedule() {
    const container = document.getElementById("scheduleListContainer");
    if (!container) return;

    const isExecOrAdmin = this.currentRole === "exec" || this.currentRole === "admin";

    if (this.lectures.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 48px; color: var(--color-mute);">등록된 13기 강의 커리큘럼이 없습니다.</div>`;
      return;
    }

    container.innerHTML = this.lectures.map(l => `
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

            <h3 style="font-size: 20px; margin: 6px 0; font-weight: 700;">${l.title}</h3>
            <div style="font-size: 13.5px; color: var(--color-mute); margin-bottom: 8px;">
              <strong style="color: var(--color-ink);">${l.speaker}</strong> | 📅 ${l.date} | 📍 ${l.location}
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
              <div style="font-size: 12.5px; background: var(--color-surface-soft); padding: 3px 10px; border-radius: var(--radius-sm); color: var(--color-mute); border: 1px solid var(--color-hairline);">
                이력: ${l.speakerBio}
              </div>
              ${l.speakerURL && l.speakerURL.trim() !== '' ? `
                <a href="${l.speakerURL.startsWith('http') ? l.speakerURL : 'https://' + l.speakerURL}" target="_blank" rel="noopener noreferrer" style="font-size: 12.5px; font-weight: 700; background: var(--color-surface-soft); padding: 3px 10px; border-radius: var(--radius-sm); color: var(--color-primary); border: 1px solid var(--color-hairline); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                  🔗 강사 소속 및 활동사항 →
                </a>
              ` : ''}
            </div>
            <p style="font-size: 14.5px; color: var(--color-body); margin: 0; line-height: 1.5;">${l.description}</p>
          </div>

          <!-- 2열 (오른쪽): DOWNLOAD MATERIAL (강의자료 업로드 시에만 표출) 및 액션 단추 -->
          <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 8px; flex-shrink: 0; min-width: 180px;">
            ${(l.materialUrl && l.materialUrl.trim() !== '') ? `
              <button class="btn btn-outline btn-sm" style="padding: 9px 16px; font-size: 13px; font-weight: 700; width: 100%; max-width: 200px; justify-content: center;" onclick="App.downloadMaterial('${l.title}', '${l.materialUrl}')">
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
    `).join("");

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

    if (isNaN(week) || !title || !date || !speaker) {
      this.showToast("⚠️ 필수 정보를 정확히 입력해 주세요.");
      return;
    }

    const newLecture = {
      id: `lec-w${week}`,
      cohort, // 💡 Lectures DB 기수 번호 필드 (13기)
      week,
      title,
      date,
      location,
      speaker,
      speakerURL: speakerURL, // 💡 Firestore Lectures DB의 'speakerURL' 필드만 유일하게 기록
      description,
      materialUrl: materialUrl,
      photos: []
    };

    // 💡 Firebase Firestore 클라우드 DB 'lectures' 컬렉션에 실시간 저장!
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
        const result = await window.signInWithPopup(window.auth, window.googleProvider);
        googleUser = result.user;
      } catch (err) {
        console.warn("Firebase Google Auth 인증 팝업 예외/안내:", err.message);
        if (err.code === "auth/popup-closed-by-user") {
          this.showToast("⚠️ Google 로그인 팝업 창이 닫혔습니다.");
        } else {
          this.showToast("⚠️ Google 인증 오류: " + (err.message || "인증을 완료하지 못했습니다."));
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

    // 💡 1. 구글 고유 UID 및 이메일 기반으로 기존 가입 회원 100% 정밀 탐색
    const existingMember = this.members.find(m => 
      (m.googleUid && m.googleUid === googleUid) ||
      (googleEmail && m.googleEmail && m.googleEmail === googleEmail) ||
      m.id === `mem-g-${googleUid.slice(0, 6)}`
    );

    if (existingMember) {
      // 💡 이미 가입된 구글 회원이 존재하면: 프로필 이름을 변경했더라도 100% 동일 계정으로 즉시 로그인!
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
      company: "",
      industry: "",
      industryIcon: "",
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
      company,
      industry,
      industryIcon: (this.getIndustryMetadata(industry) || { icon: "💻" }).icon,
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

    const spkUrl = lec.speakerURL ? lec.speakerURL.trim() : "";

    let shareText = `━━━━━━━━━━━━━━━━━━━━\n📢 [기업가정신 포럼 13기]\n   ${lec.week}주차 정기 강연 안내\n━━━━━━━━━━━━━━━━━━━━\n\n📌 [강의 주제]\n   ${lec.title}\n\n🗓️ [일시] ${lec.date}\n📍 [장소] ${lec.location}\n🎙️ [강사] ${lec.speaker} (${lec.speakerBio})\n`;

    if (spkUrl) {
      shareText += `🔗 [강사 소속 및 활동사항]\n   ${spkUrl}\n`;
    }

    shareText += `\n────────────────────\n✨ 13기 원우님의 많은 참석을 바랍니다!`;

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
    document.getElementById("profileCompany").value = user.company || "";
    const profileCohortEl = document.getElementById("profileCohort");
    if (profileCohortEl) profileCohortEl.value = user.cohort || 13;

    document.getElementById("profileIndustry").value = user.industry || "정보통신업";
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

    const sidebarName = document.getElementById("sidebarMemberName");
    const sidebarRole = document.getElementById("sidebarMemberRole");
    const feeStatusBadge = document.getElementById("feeStatusBadge");

    if (sidebarName) sidebarName.textContent = user.name;
    if (sidebarRole) {
      sidebarRole.textContent = `${user.cohort}기 · ${this.getRoleName(user.role)}`;
    }

    if (feeStatusBadge) {
      if (user.feePaid) {
        feeStatusBadge.textContent = `회비 납부 완료 (${user.feeDate})`;
        feeStatusBadge.style.background = "#dcfce7";
        feeStatusBadge.style.color = "#15803d";
      } else {
        feeStatusBadge.textContent = "회비 미납 상태";
        feeStatusBadge.style.background = "#fee2e2";
        feeStatusBadge.style.color = "#b91c1c";
      }
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
    const meta = this.getIndustryMeta ? this.getIndustryMeta(selectedIndustry) : { icon: "💻" };
    const pageURLVal = document.getElementById("profilePageURL") ? document.getElementById("profilePageURL").value.trim() : "";
    const PemailVal = document.getElementById("profilePemail") ? document.getElementById("profilePemail").value.trim() : "";

    const updatedUser = {
      ...this.members[userIndex],
      name: document.getElementById("profileName").value.trim(),
      company: document.getElementById("profileCompany").value.trim(),
      cohort: selectedCohort,
      industry: selectedIndustry,
      industryIcon: meta.icon,
      location: document.getElementById("profileLocation").value.trim(),
      phone: document.getElementById("profilePhone").value.trim(),
      kakaoId: document.getElementById("profileKakao").value.trim(),
      pageURL: pageURLVal, // 💡 회사 홈페이지 웹사이트 URL 저장
      Pemail: PemailVal, // 💡 개인 이메일(Pemail) 저장
      summary: document.getElementById("profileSummary").value.trim()
    };

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

    tableBody.innerHTML = this.members.map(m => {
      const todayStr = new Date().toISOString().split("T")[0];
      const defaultFeeDate = (m.feeDate && m.feeDate !== "-") ? m.feeDate : todayStr;

      return `
        <tr>
          <td><strong>${m.name}</strong> (${m.cohort}기)</td>
          <td>${m.company}</td>
          <td>
            <select class="form-input" style="padding: 4px 8px; font-size: 13px; min-height: 32px; width: auto;" ${isAdmin ? '' : 'disabled'} onchange="App.changeMemberRole('${m.id}', this.value)">
              <option value="regular" ${m.role === 'regular' ? 'selected' : ''}>일반회원</option>
              <option value="full" ${m.role === 'full' ? 'selected' : ''}>정회원</option>
              <option value="exec" ${m.role === 'exec' ? 'selected' : ''}>임원</option>
              <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>관리자</option>
            </select>
            ${!isAdmin ? '<span style="font-size: 11px; color: var(--color-mute); margin-left: 4px;">🔒 관리자 전용</span>' : ''}
          </td>
          <td>${m.joinDate}</td>
          <td>
            <span class="pill-tag-nvidia" style="background: ${m.feePaid ? '#dcfce7' : '#fee2e2'}; color: ${m.feePaid ? '#15803d' : '#b91c1c'}; font-size: 11px;">
              ${m.feePaid ? '납부완료' : '미납'}
            </span>
          </td>
          <td>
            ${m.feePaid ? `
              <span style="font-size: 13px; font-weight: 700; color: #16a34a;">📅 ${m.feeDate || '-'}</span>
            ` : `
              <input type="date" id="feeDateInput_${m.id}" class="form-input" style="padding: 3px 6px; font-size: 12px; width: 135px;" value="${defaultFeeDate}" title="납부 처리 시 입력할 회비 납부일자" />
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

    this.renderLedger();
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

    // 💡 두 계정 데이터 스마트 병합 (Merge)
    const mergedUser = {
      ...primary,
      googleUid: primary.googleUid || secondary.googleUid || "",
      googleEmail: primary.googleEmail || secondary.googleEmail || "",
      Pemail: primary.Pemail || secondary.Pemail || primary.googleEmail || secondary.googleEmail || "",
      phone: primary.phone || secondary.phone || "",
      kakaoId: primary.kakaoId || secondary.kakaoId || "",
      company: primary.company || secondary.company || "",
      industry: primary.industry || secondary.industry || "",
      industryIcon: primary.industryIcon || secondary.industryIcon || "",
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
    const m = this.members.find(item => item.id === memberId);
    if (!m) return;

    if (!m.feePaid) {
      // 💡 회비 미납 -> 납부완료 전환 시: 반드시 feeDate가 입력되어야만 납부 처리 진행
      const dateInput = document.getElementById(`feeDateInput_${memberId}`);
      const inputVal = dateInput ? dateInput.value.trim() : "";

      if (!inputVal) {
        alert("⚠️ 회비 납부일자를 정확히 입력하셔야 납부 처리 완료로 전환됩니다.");
        return;
      }

      m.feePaid = true;
      m.feeDate = inputVal;

      // 회비 납부 완료 시 일반회원은 정회원으로 자동 승인 전환
      if (m.role === "regular") {
        m.role = "full";
        this.showToast(`🎉 ${m.name} 회원의 회비 납부 완료(${inputVal})로 정회원(full) 승인 처리되었습니다.`);
      } else {
        this.showToast(`🎉 ${m.name} 회원의 회비 납부 완료(${inputVal})가 처리되었습니다.`);
      }
    } else {
      // 납부완료 -> 미납 전환 시
      m.feePaid = false;
      m.feeDate = "-";
      if (m.role === "full") {
        m.role = "regular";
        this.showToast(`⚠️ ${m.name} 회원의 회비 미납 처리로 일반회원(regular) 조정되었습니다.`);
      } else {
        this.showToast(`${m.name} 회원이 회비 미납 상태로 전환되었습니다.`);
      }
    }

    StorageService.saveMembers(this.members);

    // 💡 입력된 feeDate값과 납부상태 feePaid를 해당 회원정보 Firebase Firestore 데이터베이스에 실시간 업데이트!
    if (window.db && window.FS && window.FS.setDoc && window.FS.doc) {
      try {
        await window.FS.setDoc(window.FS.doc(window.db, "members", memberId), { 
          feePaid: m.feePaid, 
          feeDate: m.feeDate, 
          role: m.role 
        }, { merge: true });
        console.log(`Firebase Firestore: ${m.name} 회비(feePaid: ${m.feePaid}, feeDate: ${m.feeDate}) 클라우드 DB 저장 성공`);
      } catch (err) {
        console.warn("Firestore 회비 처리 시도 오류:", err);
      }
    }

    this.renderAdmin();
  },

  renderLedger() {
    const ledgerTable = document.getElementById("ledgerTableBody");
    if (!ledgerTable) return;

    let totalSponsorship = 0;
    let totalExpense = 0;

    this.ledger.forEach(item => {
      if (item.type === "sponsorship") {
        totalSponsorship += item.amount;
      } else {
        totalExpense += item.amount;
      }
    });

    const balance = totalSponsorship - totalExpense;

    document.getElementById("totalSponsorshipAmount").textContent = `${totalSponsorship.toLocaleString()}원`;
    document.getElementById("totalExpenseAmount").textContent = `${totalExpense.toLocaleString()}원`;
    document.getElementById("ledgerBalanceAmount").textContent = `${balance.toLocaleString()}원`;

    ledgerTable.innerHTML = this.ledger.map(item => `
      <tr>
        <td>${item.date}</td>
        <td>
          <span style="color: ${item.type === 'sponsorship' ? '#16a34a' : '#dc2626'}; font-weight: 700;">
            ${item.type === 'sponsorship' ? '🟢 찬조/수입' : '🔴 지출'}
          </span>
        </td>
        <td><strong>${item.name}</strong> (${item.category})</td>
        <td>${item.item}</td>
        <td style="font-weight: 700;">${item.amount.toLocaleString()}원</td>
        <td style="color: var(--color-mute); font-size: 13px;">${item.note || '-'}</td>
      </tr>
    `).join("");
  },

  addLedgerEntry() {
    const type = document.getElementById("ledgerType").value;
    const name = document.getElementById("ledgerName").value;
    const category = document.getElementById("ledgerCategory").value;
    const item = document.getElementById("ledgerItem").value;
    const amount = parseInt(document.getElementById("ledgerAmount").value, 10);
    const note = document.getElementById("ledgerNote").value;

    if (!name || !item || isNaN(amount)) {
      alert("필수 항목을 입력하세요.");
      return;
    }

    const newEntry = {
      id: `led-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      type,
      name,
      category,
      item,
      amount,
      note
    };

    this.ledger.unshift(newEntry);
    StorageService.saveLedger(this.ledger);
    this.showToast("장부 내역이 추가되었습니다.");
    this.renderLedger();

    document.getElementById("ledgerForm").reset();
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
