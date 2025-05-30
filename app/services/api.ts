import axios from "axios";
import { jwtDecode } from "jwt-decode";

// 프록시 API 기본 URL로 변경
const API_BASE_URL = "/api/proxy";

// JWT 토큰 디코딩 인터페이스
interface DecodedToken {
  exp: number; // 만료 시간 (Unix timestamp)
  iat: number; // 발행 시간
  sub: string; // 주체 (사용자 ID)
}

// 토큰 관련 유틸리티 함수
export const saveToken = (token: string) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("auth_token", token);
  }
};

export const saveRefreshToken = (refreshToken: string) => {
  if (typeof window !== "undefined") {
    localStorage.setItem("refresh_token", refreshToken);
  }
};

export const getToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("auth_token");
  }
  return null;
};

export const getRefreshToken = () => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("refresh_token");
  }
  return null;
};

export const removeToken = () => {
  if (typeof window !== "undefined") {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("refresh_token");
  }
};

// 토큰 만료 시간 계산 함수
export const getTokenExpirationTime = (): number | null => {
  const token = getToken();
  if (!token) return null;

  try {
    const decoded = jwtDecode<DecodedToken>(token);
    return decoded.exp * 1000; // 밀리초로 변환
  } catch (error) {
    console.error("토큰 디코딩 오류:", error);
    return null;
  }
};

// 토큰 남은 시간 계산 (초 단위)
export const getTokenRemainingTime = (): number | null => {
  const expirationTime = getTokenExpirationTime();
  if (!expirationTime) return null;

  const now = Date.now();
  const remainingTime = expirationTime - now;

  return remainingTime > 0 ? Math.floor(remainingTime / 1000) : 0;
};

// API 호출 함수
export const api = {
  // 관리자 로그인
  login: async (username: string, password: string) => {
    try {
      const response = await axios.post(`${API_BASE_URL}/admin/login`, {
        username,
        password,
      });

      // 디버깅을 위해 응답 데이터 확인
      console.log("로그인 응답:", response.data);

      // access_token이 응답에 직접 있거나 중첩된 객체 내에 있을 수 있음
      if (response.data.access_token) {
        saveToken(response.data.access_token);
        if (response.data.refresh_token) {
          console.log("리프레시 토큰 저장:", response.data.refresh_token);
          saveRefreshToken(response.data.refresh_token);
        } else {
          console.warn("리프레시 토큰이 응답에 없습니다");
        }
        return { success: true, data: response.data };
      } else if (
        response.data.success &&
        response.data.data &&
        response.data.data.access_token
      ) {
        // 응답이 { success: true, data: { access_token: '...' } } 형태인 경우
        saveToken(response.data.data.access_token);
        if (response.data.data.refresh_token) {
          console.log("리프레시 토큰 저장:", response.data.data.refresh_token);
          saveRefreshToken(response.data.data.refresh_token);
        } else {
          console.warn("리프레시 토큰이 중첩된 응답에 없습니다");
        }
        return { success: true, data: response.data.data };
      }

      // 실패 응답 또는 성공했지만 토큰이 없는 경우
      return {
        success: false,
        error:
          response.data.message ||
          response.data.error ||
          "로그인에 실패했습니다.",
      };
    } catch (error) {
      console.error("로그인 오류:", error);
      return { success: false, error: "로그인 중 오류가 발생했습니다." };
    }
  },

  // 토큰 리프레시
  refreshToken: async () => {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        console.warn("리프레시 토큰이 없습니다. 재로그인이 필요합니다.");
        return {
          success: false,
          error: "로그인 세션을 연장할 수 없습니다. 재로그인이 필요합니다.",
          needRelogin: true,
        };
      }

      const response = await axios.post(`${API_BASE_URL}/admin/refresh`, {
        refresh_token: refreshToken,
      });

      console.log("토큰 리프레시 응답:", response.data);

      if (response.data.access_token) {
        saveToken(response.data.access_token);
        if (response.data.refresh_token) {
          console.log("새 리프레시 토큰 저장:", response.data.refresh_token);
          saveRefreshToken(response.data.refresh_token);
        }
        return { success: true, data: response.data };
      } else if (
        response.data.success &&
        response.data.data &&
        response.data.data.access_token
      ) {
        saveToken(response.data.data.access_token);
        if (response.data.data.refresh_token) {
          console.log(
            "새 리프레시 토큰 저장:",
            response.data.data.refresh_token
          );
          saveRefreshToken(response.data.data.refresh_token);
        }
        return { success: true, data: response.data.data };
      }

      return {
        success: false,
        error:
          response.data.message ||
          response.data.error ||
          "토큰 갱신에 실패했습니다.",
      };
    } catch (error) {
      console.error("토큰 갱신 오류:", error);
      return { success: false, error: "토큰 갱신 중 오류가 발생했습니다." };
    }
  },

  // 새 관리자 계정 생성
  createAdmin: async (username: string, password: string) => {
    try {
      const token = getToken();
      if (!token) {
        return { success: false, error: "인증이 필요합니다." };
      }

      const response = await axios.post(
        `${API_BASE_URL}/admin/create`,
        {
          username,
          password,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.success) {
        return {
          success: true,
          message:
            response.data.message || "관리자 계정이 성공적으로 추가되었습니다.",
        };
      }

      return {
        success: false,
        error:
          response.data.message ||
          response.data.error ||
          "관리자 계정 생성에 실패했습니다.",
      };
    } catch (error: any) {
      console.error("관리자 계정 생성 오류:", error);
      return {
        success: false,
        error:
          error.response?.data?.message ||
          "관리자 계정 생성 중 오류가 발생했습니다.",
      };
    }
  },

  // 출석 기록
  recordAttendance: async (number: number, sessionId: string) => {
    try {
      console.log(`출석 기록 API 호출 시작: 번호 ${number}, 회차 ${sessionId}`);

      const response = await axios.post(`${API_BASE_URL}/attendance/record`, {
        number,
        sessionId,
      });

      console.log("출석 기록 API 응답:", response.data);

      // 응답 데이터 구조 확인 및 처리
      const responseData = response.data;

      // 중복 출석 감지 - 다양한 응답 형태 처리
      const isDuplicateAttendance =
        (responseData.message &&
          responseData.message.includes("이미 출석한 이력이 있습니다")) ||
        (responseData.error &&
          responseData.error.includes("이미 출석한 이력이 있습니다")) ||
        (responseData.message &&
          responseData.message.includes("오늘 이미 출석한 이력이 있습니다")) ||
        (responseData.error &&
          responseData.error.includes("오늘 이미 출석한 이력이 있습니다")) ||
        responseData.isDuplicate === true;

      // 중복 출석인 경우
      if (isDuplicateAttendance) {
        console.log(`출석번호 ${number}: 중복 출석 감지`);
        return {
          success: false,
          error: "오늘 이미 출석한 이력이 있습니다.",
          isDuplicate: true,
        };
      }

      // 명시적으로 실패한 경우
      if (responseData.success === false) {
        console.log(`출석번호 ${number}: 명시적 실패`, responseData);
        return {
          success: false,
          error:
            responseData.message ||
            responseData.error ||
            "출석 기록에 실패했습니다.",
          isDuplicate: false,
        };
      }

      // 성공한 경우 (success가 true이거나 명시되지 않았지만 오류가 없는 경우)
      if (
        responseData.success === true ||
        (!responseData.success && !responseData.error && !responseData.message)
      ) {
        console.log(`출석번호 ${number}: 출석 기록 성공`);
        return {
          success: true,
          data: responseData,
        };
      }

      // 기타 예상치 못한 응답
      console.log(`출석번호 ${number}: 예상치 못한 응답`, responseData);
      return {
        success: false,
        error:
          responseData.message ||
          responseData.error ||
          "알 수 없는 오류가 발생했습니다.",
        isDuplicate: false,
      };
    } catch (error: any) {
      console.error(`출석번호 ${number}: API 호출 중 오류 발생`, error);

      // 서버에서 400, 409 등의 상태 코드로 중복 출석을 알리는 경우
      if (error.response?.data) {
        const errorData = error.response.data;
        const statusCode = error.response.status;

        console.error(`HTTP ${statusCode} 오류:`, errorData);

        const isDuplicateError =
          (errorData.message &&
            errorData.message.includes("이미 출석한 이력이 있습니다")) ||
          (errorData.error &&
            errorData.error.includes("이미 출석한 이력이 있습니다")) ||
          (errorData.message &&
            errorData.message.includes("오늘 이미 출석한 이력이 있습니다")) ||
          (errorData.error &&
            errorData.error.includes("오늘 이미 출석한 이력이 있습니다"));

        if (isDuplicateError) {
          console.log(`출석번호 ${number}: HTTP 오류에서 중복 출석 감지`);
          return {
            success: false,
            error: "오늘 이미 출석한 이력이 있습니다.",
            isDuplicate: true,
          };
        }

        // 500 에러의 경우 더 자세한 정보 제공
        if (statusCode === 500) {
          console.error("서버 내부 오류 (500):", {
            url: `${API_BASE_URL}/attendance/record`,
            requestData: { number, sessionId },
            responseData: errorData,
            fullError: error,
          });

          return {
            success: false,
            error: `서버 내부 오류가 발생했습니다. (출석번호: ${number}, 회차: ${sessionId})`,
            isDuplicate: false,
          };
        }

        return {
          success: false,
          error:
            errorData.message ||
            errorData.error ||
            `출석 기록에 실패했습니다. (HTTP ${statusCode})`,
          isDuplicate: false,
        };
      }

      // 네트워크 오류 등
      if (
        error.code === "NETWORK_ERROR" ||
        error.message.includes("Network Error")
      ) {
        console.error("네트워크 오류:", error);
        return {
          success: false,
          error: "네트워크 연결을 확인해주세요.",
          isDuplicate: false,
        };
      }

      // 기타 오류
      console.error("기타 오류:", error);
      return {
        success: false,
        error: `출석 기록 중 오류가 발생했습니다. (${
          error.message || "알 수 없는 오류"
        })`,
        isDuplicate: false,
      };
    }
  },

  // 날짜별 출석 조회
  getAttendanceByDate: async (date: string, sessionId?: string) => {
    try {
      const token = getToken();
      if (!token) {
        return { success: false, error: "인증이 필요합니다." };
      }

      let url = `${API_BASE_URL}/attendance?date=${date}`;
      if (sessionId) {
        url += `&sessionId=${sessionId}`;
      }

      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: "출석 조회 중 오류가 발생했습니다." };
    }
  },

  // 회차별 출석 조회
  getAttendanceBySession: async (sessionId: string) => {
    try {
      const token = getToken();
      if (!token) {
        return { success: false, error: "인증이 필요합니다." };
      }

      const response = await axios.get(
        `${API_BASE_URL}/attendance/session?sessionId=${sessionId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: "출석 조회 중 오류가 발생했습니다." };
    }
  },

  // 구글 스프레드시트로 내보내기
  exportToGoogleSheets: async (sessionName: string, data: any[][]) => {
    try {
      console.log("=== 구글 시트 내보내기 API 호출 시작 ===");
      console.log("요청 데이터:", {
        sessionName,
        dataLength: data.length,
        dataPreview: data.slice(0, 3),
      });

      const response = await fetch("/api/export/google-sheets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          sessionName,
          data,
        }),
      });

      console.log("HTTP 응답 상태:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
      });

      const result = await response.json();
      console.log("서버 응답 데이터:", result);

      if (response.ok) {
        console.log("✅ 구글 시트 내보내기 성공:", result);
        return {
          success: true,
          message: result.message,
          sheetName: result.sheetName,
          recordCount: result.recordCount,
          sheetUrl: result.sheetUrl,
        };
      } else {
        console.error("❌ 구글 시트 내보내기 실패:", {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
          fullResponse: result,
        });
        return {
          success: false,
          error: result.error || "구글 시트 내보내기에 실패했습니다.",
        };
      }
    } catch (error: any) {
      console.error("❌ 구글 시트 내보내기 API 오류:");
      console.error("오류 타입:", error.constructor.name);
      console.error("오류 메시지:", error.message);
      console.error("전체 오류 객체:", error);
      console.error("네트워크 정보:", {
        type: error.name,
        code: error.code,
        stack: error.stack?.split("\n").slice(0, 5), // 스택 트레이스 일부만
      });

      return {
        success: false,
        error: `네트워크 오류가 발생했습니다: ${error.message}`,
      };
    }
  },
};
