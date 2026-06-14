[README.md](https://github.com/user-attachments/files/28922571/README.md)
# 배달 경로 최적화 앱 배포 가이드

이 폴더에는 웹앱(`index.html`)과 서버 코드(`api/optimize.js`)가 들어 있습니다.
아래 순서대로 따라 하면 누구나 무료로 인터넷에 띄울 수 있습니다.

---

## 1. GitHub에 코드 올리기

1. https://github.com 에 로그인합니다.
2. 오른쪽 위 **+** 버튼 → **New repository** 클릭
3. Repository name에 `delivery-route` 입력 → **Create repository**
4. 생성된 페이지에서 **uploading an existing file** 링크 클릭
5. 이 폴더 안의 모든 파일(`index.html`, `vercel.json`, `package.json`, `api` 폴더 전체)을
   끌어다 놓거나 선택해서 업로드합니다.
   - `api` 폴더를 통째로 끌어다 놓으면 안에 있는 `optimize.js`도 같이 올라갑니다.
6. 아래 **Commit changes** 버튼 클릭

---

## 2. Vercel에 배포하기

1. https://vercel.com 접속 → **Sign Up** → **Continue with GitHub** 선택
   (GitHub 계정으로 그대로 로그인하면 됩니다)
2. 로그인 후 **Add New...** → **Project** 클릭
3. 방금 만든 `delivery-route` 저장소를 찾아서 **Import** 클릭
4. 설정 화면에서 **Environment Variables** 항목을 펼칩니다
5. 아래와 같이 입력:
   - Name: `TMAP_APP_KEY`
   - Value: (SK Open API에서 발급받은 TMAP App Key를 붙여넣기)
   - **Add** 클릭
6. 같은 방식으로 한 줄 더 추가:
   - Name: `KAKAO_JS_KEY`
   - Value: (카카오 디벨로퍼스에서 발급받은 JavaScript 키를 붙여넣기)
   - **Add** 클릭
   - 이 키는 지도(마커) 표시에 사용됩니다. 카카오 디벨로퍼스 → 내 애플리케이션 → 앱 선택 → 앱 키 → "JavaScript 키"
   - 카카오 디벨로퍼스 → 플랫폼 → Web 플랫폼에 배포된 사이트 도메인(`https://xxxx.vercel.app`)을 등록해야 지도가 표시됩니다.
7. **Deploy** 버튼 클릭
8. 1~2분 기다리면 배포가 완료되고, `https://delivery-route-xxxx.vercel.app` 같은
   주소가 생성됩니다. 이 주소를 즐겨찾기 해두면 앱처럼 사용할 수 있습니다.

---

## 3. 사용 방법

1. 위에서 받은 주소로 접속합니다.
2. "출발지" 칸에 출발 주소를 입력합니다.
3. "배달 주소 목록"에 한 줄에 하나씩 주소를 붙여넣습니다. (최대 98개)
4. "왕복" 체크 여부를 선택합니다.
5. "경로 계산하기" 클릭
6. 잠시 후 지도와 추천 방문 순서, 예상 거리/시간이 표시됩니다.
7. CSV 다운로드 또는 순서 텍스트 복사로 결과를 저장할 수 있습니다.

---

## 문제 해결

- **"서버에 TMAP_APP_KEY 환경변수가 설정되어 있지 않습니다" 오류**
  → Vercel 프로젝트 설정(Settings → Environment Variables)에서
  `TMAP_APP_KEY`가 정확히 입력됐는지 확인하고, 다시 배포(Redeploy)합니다.

- **"서버에 KAKAO_JS_KEY 환경변수가 설정되어 있지 않습니다" 오류 또는 지도가 안 뜸**
  → `KAKAO_JS_KEY`가 정확히 입력됐는지 확인하고, 카카오 디벨로퍼스 → 플랫폼 →
  Web 플랫폼에 현재 배포 주소(`https://xxxx.vercel.app`)가 등록되어 있는지 확인 후 Redeploy합니다.

- **지오코딩 실패 주소가 많을 때**
  → 너무 간략한 주소(건물명만 입력 등)는 인식이 안 될 수 있습니다.
  "시/도 + 구/군 + 동 + 번지" 형식으로 입력하면 인식률이 올라갑니다.

- **App Key를 나중에 바꾸고 싶을 때**
  → Vercel 프로젝트 → Settings → Environment Variables에서 값을 수정하고
  Deployments 탭에서 **Redeploy** 합니다.
