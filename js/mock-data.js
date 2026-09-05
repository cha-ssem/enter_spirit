/**
 * 기업가 정신 13기 웹플랫폼 Mock Data & Database Service
 */

const INDUSTRY_IMAGE_MAP = {
  "정보통신업": "images/01_information_communication.jpg",
  "제조업": "images/02_manufacturing.jpg",
  "도매 및 소매업": "images/03_wholesale_retail.jpg",
  "전문, 과학 및 기술 서비스업": "images/04_professional_scientific_technical.jpg",
  "부동산업": "images/05_real_estate.jpg",
  "건설업": "images/06_construction.jpg",
  "교육 서비스업": "images/07_education_services.jpg",
  "보건업 및 사회복지 서비스업": "images/08_health_social_work.jpg",
  "숙박 및 음식점업": "images/09_accommodation_food.jpg",
  "금융 및 보험업": "images/10_finance_insurance.jpg",
  "운수 및 창고업": "images/11_transportation_storage.jpg",
  "예술, 스포츠 및 여가관련 서비스업": "images/12_arts_sports_recreation.jpg",
  "사업시설 관리 및 사업지원 서비스업": "images/13_business_facilities_support.jpg",
  "농업, 임업 및 어업": "images/14_agriculture_forestry_fishing.jpg",
  "기타 서비스업": "images/15_other_services.jpg"
};

const INITIAL_MEMBERS = [
  {
    id: "mem-1301",
    name: "김민준",
    cohort: 13, // 기수 (INTEGER 숫자 열)
    role: "exec", // 'regular', 'full', 'exec', 'admin'
    company: "넥스트웨이브 솔루션즈",
    industry: "정보통신업",
    industryImg: "images/01_information_communication.jpg",
    location: "서울 강남구 테헤란로 427",
    summary: "AI 기반 B2B 물류 자동화 SaaS 모듈 개발 및 기업 공급 전문",
    phone: "010-3849-1204",
    kakaoId: "minjun_nextwave",
    avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80",
    joinDate: "2026-03-02",
    feePaid: true,
    feeDate: "2026-09-02"
  },
  {
    id: "mem-1302",
    name: "박서연",
    cohort: 13,
    role: "admin",
    company: "블루바이오 헬스케어",
    industry: "보건업 및 사회복지 서비스업",
    industryImg: "images/08_health_social_work.jpg",
    location: "경기 성남시 분당구 판교역로 166",
    summary: "디지털 헬스케어 진단 기기 및 실시간 유전자 바이오마커 분석 플랫폼",
    phone: "010-9281-5541",
    kakaoId: "sy_park_bio",
    avatarUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=300&q=80",
    joinDate: "2026-03-01",
    feePaid: true,
    feeDate: "2026-09-02"
  },
  {
    id: "mem-1303",
    name: "최현우",
    cohort: 13,
    role: "full",
    company: "한성 정밀제조",
    industry: "제조업",
    industryImg: "images/02_manufacturing.jpg",
    location: "인천 연수구 송도미래로 30",
    summary: "친환경 초소형 정밀 부품 및 스마트 팩토리 자동화 라인 제작",
    phone: "010-4491-0392",
    kakaoId: "hw_choi_mfg",
    avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80",
    joinDate: "2026-03-04",
    feePaid: true,
    feeDate: "2026-09-02"
  },
  {
    id: "mem-1304",
    name: "이지은",
    cohort: 13,
    role: "full",
    company: "에코글로벌 커머스",
    industry: "도매 및 소매업",
    industryImg: "images/03_wholesale_retail.jpg",
    location: "서울 마포구 월드컵북로 400",
    summary: "글로벌 친환경 라이프스타일 브랜드 수입 유통 및 자사 몰 운영",
    phone: "010-8832-7104",
    kakaoId: "jieun_eco",
    avatarUrl: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=300&q=80",
    joinDate: "2026-03-05",
    feePaid: true,
    feeDate: "2026-09-02"
  },
  {
    id: "mem-1305",
    name: "정성훈",
    cohort: 13,
    role: "exec",
    company: "프론티어 파트너스 변호사 사무소",
    industry: "전문, 과학 및 기술 서비스업",
    industryImg: "images/04_professional_scientific_technical.jpg",
    location: "서울 서초구 법원로 15",
    summary: "스타트업 M&A, 투자 유치 계약 및 지식재산권(IP) 특화 법률 자문",
    phone: "010-6620-4419",
    kakaoId: "lawyer_jung",
    avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80",
    joinDate: "2026-03-02",
    feePaid: true,
    feeDate: "2026-09-02"
  },
  {
    id: "mem-1306",
    name: "강유진",
    cohort: 13,
    role: "full",
    company: "마인드스파크 에듀",
    industry: "교육 서비스업",
    industryImg: "images/07_education_services.jpg",
    location: "서울 종로구 율곡로 88",
    summary: "임직원 리더십 역량 강화 프로그램 및 AI 대화형 교육 플랫폼",
    phone: "010-7731-9023",
    kakaoId: "yujin_mind",
    avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=300&q=80",
    joinDate: "2026-03-06",
    feePaid: true,
    feeDate: "2026-09-02"
  },
  {
    id: "mem-1307",
    name: "윤도현",
    cohort: 13,
    role: "regular",
    company: "스마트 피트니스 코리아",
    industry: "숙박 및 음식점업",
    industryImg: "images/09_accommodation_food.jpg",
    location: "서울 송파구 올림픽로 300",
    summary: "프리미엄 무인 헬스케어 센터 체인 및 맞춤형 트레이닝 매칭 서비스",
    phone: "010-1129-8834",
    kakaoId: "dohyun_fit",
    avatarUrl: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80",
    joinDate: "2026-03-10",
    feePaid: false,
    feeDate: "-"
  },
  {
    id: "mem-1308",
    name: "송지아",
    cohort: 13,
    role: "regular",
    company: "크리에이티브 스튜디오 지아",
    industry: "예술, 스포츠 및 여가관련 서비스업",
    industryImg: "images/12_arts_sports_recreation.jpg",
    location: "서울 용산구 이태원로 200",
    summary: "기업 브랜딩 정체성 구축 및 감성적 브랜디드 영상 콘텐츠 제작",
    phone: "010-5510-3391",
    kakaoId: "jia_creative",
    avatarUrl: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=300&q=80",
    joinDate: "2026-03-12",
    feePaid: false,
    feeDate: "-"
  }
];

const INITIAL_LECTURES = [
  {
    week: 1,
    title: "지속 성장을 위한 혁신 리더십",
    date: "2026-09-05 (토) 13:30",
    location: "산학협력관 7층 동의시네마홀",
    speaker: "이금룡 이사장",
    speakerBio: "(사)도전과나눔",
    speakerURL: "https://www.dona.kr/",
    description: "불확실한 비즈니스 환경에서 지속 가능한 기업 성장을 실현하는 혁신 기업가 정신과 통찰력 있는 리더십 전략",
    materialUrl: "lecture_w01_intro.pdf",
    photos: [
      "https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=300&q=80",
      "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=300&q=80"
    ]
  },
  {
    week: 2,
    title: "인공지능(AI) 혁신과 B2B 비즈니스 모델 재설계",
    date: "2026-09-10 (목) 19:00",
    location: "본관 4층 프레스티지홀",
    speaker: "이승철 대표",
    speakerBio: "(주)알파인텔리전스 대표이사 / AI 인사이트 포럼 의장",
    description: "Generative AI 기술을 기존 산업군에 이식하여 고부가가치를 창출하는 실전 전략 사례 연구",
    materialUrl: "lecture_w02_ai_strategy.pdf",
    photos: [
      "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=300&q=80"
    ]
  },
  {
    week: 3,
    title: "투자 유치(IR) 스케일업과 기업 가치 산정법",
    date: "2026-09-17 (목) 19:00",
    location: "본관 4층 프레스티지홀",
    speaker: "김경태 대표파트너",
    speakerBio: "미래자산운용 벤처투자본부 총괄 부사장",
    description: "VC 관점에서의 피칭 기법, Valuation 심사 기준 및 성공적인 시리즈 B/C 스케일업 노하우",
    materialUrl: "lecture_w03_investment.pdf",
    photos: []
  },
  {
    week: 4,
    title: "스마트 조직 문화와 고성능 팀 리더십",
    date: "2026-09-24 (목) 19:00",
    location: "본관 4층 프레스티지홀",
    speaker: "정유진 CPO",
    speakerBio: "전 유니콘 스타트업 최고인사책임자",
    description: "MZ세대 조화와 핵심 인재 이탈 방지, 자율적 성과 창출 시스템 구축 실무",
    materialUrl: "lecture_w04_leadership.pdf",
    photos: []
  },
  {
    week: 5,
    title: "중견·중소기업을 위한 M&A 및 사업 다각화",
    date: "2026-10-01 (목) 19:00",
    location: "본관 4층 프레스티지홀",
    speaker: "임재현 회계사",
    speakerBio: "삼일PwC M&A 자문본부 상무이사",
    description: "기업 인수합병 구조 설계, 실무 Due Diligence 절차 및 리스크 관리",
    materialUrl: "lecture_w05_ma_strategy.pdf",
    photos: []
  }
];

const INITIAL_EVENTS = [];

const INITIAL_LEDGER = [];

/* Storage Helper */
class StorageService {
  static getMembers() {
    const data = localStorage.getItem("enterprise_13th_members");
    if (!data) {
      localStorage.setItem("enterprise_13th_members", JSON.stringify(INITIAL_MEMBERS));
      return INITIAL_MEMBERS;
    }
    let parsed = JSON.parse(data);
    // 14기 임시 삭제 요청 반영: mem-1401, mem-1402 제거
    const originalLength = parsed.length;
    parsed = parsed.filter(m => m.id !== "mem-1401" && m.id !== "mem-1402");

    // cohort가 문자열 형태일 경우 숫자로 자동 정규화 변환
    let updated = originalLength !== parsed.length;
    const todayStr = new Date().toLocaleDateString("sv-SE");
    parsed.forEach(m => {
      if (typeof m.cohort === "string") {
        m.cohort = parseInt(m.cohort.replace(/[^0-9]/g, ""), 10) || 13;
        updated = true;
      }
      // 💡 업종 이모지 아이콘 삭제 및 최신 업종 이미지 경로 동기화
      if ("industryIcon" in m) {
        delete m.industryIcon;
        updated = true;
      }
      if (m.industry) {
        const expectedImg = INDUSTRY_IMAGE_MAP[m.industry] || "images/15_other_services.jpg";
        if (m.industryImg !== expectedImg) {
          m.industryImg = expectedImg;
          updated = true;
        }
      }
      // 💡 초기 13기 납부 회원의 과거 샘플 납부일자(2026-03-XX)를 오늘 날짜로 최신 동기화
      if (m.feePaid && m.feeDate && m.feeDate.startsWith("2026-03-")) {
        m.feeDate = todayStr;
        updated = true;
      }
    });
    if (updated) {
      localStorage.setItem("enterprise_13th_members", JSON.stringify(parsed));
    }
    return parsed;
  }

  static saveMembers(members) {
    // cohort를 항상 정수 숫자로 보장
    members.forEach(m => {
      if (typeof m.cohort === "string") {
        m.cohort = parseInt(m.cohort.replace(/[^0-9]/g, ""), 10) || 13;
      }
    });
    localStorage.setItem("enterprise_13th_members", JSON.stringify(members));
  }

  static getLectures() {
    const data = localStorage.getItem("enterprise_13th_lectures");
    if (!data) {
      localStorage.setItem("enterprise_13th_lectures", JSON.stringify(INITIAL_LECTURES));
      return INITIAL_LECTURES;
    }
    let parsed = JSON.parse(data);
    // 💡 1주차 강연 정보 최신 동기화 (지속 성장을 위한 혁신 리더십 / 이금룡 이사장)
    const w1 = parsed.find(l => l.week === 1);
    if (w1 && (w1.speaker !== "이금룡 이사장" || !w1.speakerURL)) {
      w1.title = "지속 성장을 위한 혁신 리더십";
      w1.date = "2026-09-05 (토) 13:30";
      w1.location = "산학협력관 7층 동의시네마홀";
      w1.speaker = "이금룡 이사장";
      w1.speakerBio = "(사)도전과나눔";
      w1.speakerURL = "https://www.dona.kr/";
      localStorage.setItem("enterprise_13th_lectures", JSON.stringify(parsed));
    }
    return parsed;
  }

  static saveLectures(lectures) {
    localStorage.setItem("enterprise_13th_lectures", JSON.stringify(lectures));
  }

  static getEvents() {
    const data = localStorage.getItem("enterprise_13th_events");
    if (!data) {
      localStorage.setItem("enterprise_13th_events", JSON.stringify(INITIAL_EVENTS));
      return INITIAL_EVENTS;
    }
    try {
      return JSON.parse(data) || [];
    } catch (e) {
      return INITIAL_EVENTS;
    }
  }

  static saveEvents(events) {
    localStorage.setItem("enterprise_13th_events", JSON.stringify(events));
  }

  static getLedger() {
    const data = localStorage.getItem("enterprise_13th_ledger");
    if (!data) {
      localStorage.setItem("enterprise_13th_ledger", JSON.stringify(INITIAL_LEDGER));
      return INITIAL_LEDGER;
    }
    let parsed = JSON.parse(data);
    // 이전 샘플 더미 내역(led-01~led-04) 및 initial_balance 설정 문서 자동 필터링 제거
    const filtered = parsed.filter(item => {
      if (!item) return false;
      if (item.id === "initial_balance" || item.isConfig === true) {
        if (typeof item.initialBalance === "number") {
          localStorage.setItem("enterprise_13th_initial_balance", item.initialBalance.toString());
        }
        return false;
      }
      return item.id !== "led-01" && item.id !== "led-02" && item.id !== "led-03" && item.id !== "led-04";
    });
    if (filtered.length !== parsed.length) {
      localStorage.setItem("enterprise_13th_ledger", JSON.stringify(filtered));
    }
    return filtered;
  }

  static saveLedger(ledger) {
    localStorage.setItem("enterprise_13th_ledger", JSON.stringify(ledger));
  }

  static getInitialBalance() {
    const val = localStorage.getItem("enterprise_13th_initial_balance");
    return val !== null ? parseInt(val, 10) : 0;
  }

  static saveInitialBalance(amount) {
    localStorage.setItem("enterprise_13th_initial_balance", amount.toString());
  }

  static getCurrentUserRole() {
    return localStorage.getItem("enterprise_current_role") || "guest";
  }

  static setCurrentUserRole(role) {
    localStorage.setItem("enterprise_current_role", role);
  }

  static getCurrentUserId() {
    return localStorage.getItem("enterprise_current_user_id") || "";
  }

  static setCurrentUserId(userId) {
    if (userId) {
      localStorage.setItem("enterprise_current_user_id", userId);
    } else {
      localStorage.removeItem("enterprise_current_user_id");
    }
  }
}
