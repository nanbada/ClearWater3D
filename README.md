# CleanWater 3D (3D 물 효과 시뮬레이터)

> **물리 기반 실시간 3D 수면 및 광학 시뮬레이션 웹 애플리케이션**  
> WebGL 2.0, FFT 해양 파도 스펙트럼(Ocean Wave Spectrum), 2D 천수방정식(Shallow Water Wave Equation), 굴절 코스틱(Refraction Caustics), 대기 산란 및 주간 일주(Time of Day) 조명 시스템 구현.

---

## 🌊 주요 기능 (Features)

1. **듀얼 시뮬레이션 엔진 (Dual Simulation Engine)**
   - **FFT 해양 스펙트럼 (Ocean Wave FFT)**: Phillips / JONSWAP 모델 기반 고해상도 부유 파도 및 잔물결 실시간 합성.
   - **2D 동적 파동 방정식 (Dynamic Wave Equation)**: 마우스/터치 드래그, 클릭 물방울 낙하에 따른 상호작용적 표면 파동 전파 및 경계 반사 시뮬레이션.

2. **물리 기반 광학 렌더링 (PBR & Optics)**
   - **굴절 격자 코스틱 (Caustics Rendering)**: 수면 메쉬 굴절 벡터 수렴을 실시간으로 추적하여 자갈 바닥에 투사되는 자연스러운 빛망울(코스틱) 계산.
   - **프레넬 반사 및 수중 흡수/산란 (Fresnel & Water Absorption)**: Beer-Lambert 법칙에 따른 수심별 적색/녹색광 흡수 및 수중 청록색 다이나믹 산란.
   - **실시간 태양 스펙큘러 & 렌즈 회절 (Specular Glare & Flare)**: 태양광 지향각에 따른 카메라 렌즈 회절 및 블룸 효과.

3. **태양 일주 및 조명 제어 (Time of Day & Atmosphere)**
   - **연속 주야간 일주 (Day Cycle)**: 일출(06:00, 2150K) ~ 정오(12:30, 6200K) ~ 일몰(19:15, 2100K)의 태양 고도/방위각/색온도/광도 연속 시뮬레이션.
   - **자동 시간 흐름(Auto Daylight Cycle)** 및 직관적인 퀵 슬라이더 바 제공.
   - **조명 세부 파라미터**: 색온도(Kelvin), 태양 방사도(Sun Radiance), 고도 및 방위각 수동 오버라이드.

4. **환경 프리셋 & 사운드 제어**
   - **6가지 수질 프리셋**: 에메랄드 카리브해(Tropical Lagoon), 맑은 수정 수영장(Crystal Pool), 일몰 바다(Sunset Ocean), 자정 심해(Deep Ocean), 거친 외해(Stormy Seas), 청정 계곡수(Mountain Spring).
   - **동적 오디오**: Web Audio API 기반 절차적 수면 잔물결 소리 및 강우 앰비언트 합성.
   - **강우 모드(Rain Mode)**: 빗방울 낙하 시뮬레이션 및 파동 연쇄 반응.

---

## 🚀 빠른 시작 (Getting Started)

### 요구 사양
- Node.js 18+ 또는 Bun
- WebGL 2.0 및 부동소수점 텍스처 확장(`EXT_color_buffer_float` 또는 `EXT_color_buffer_half_float`)을 지원하는 브라우저

### 설치 및 실행
```bash
# 의존성 설치
npm install

# 개발 서버 실행 (포트 3000)
npm run dev

# 프로덕션 빌드
npm run build
```

---

## 🛠 기술 스택 (Tech Stack)

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide React
- **Graphics & Compute**: WebGL 2.0 (GLSL ES 3.00), Float Framebuffers, Ping-Pong Texturing
- **Audio**: Web Audio API (Synthesized Water & Rain Ambience)
- **Bundler**: Vite 6+
