"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  getToken,
  removeToken,
  getTokenRemainingTime,
} from "../services/api";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import QRScanner from "../components/QRScanner";
import Link from "next/link";
import dynamic from "next/dynamic";

interface AttendanceRecord {
  studentNumber: number;
  timestamp: string;
  date: string;
  time: string;
  sessionId?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [filteredRecords, setFilteredRecords] = useState<AttendanceRecord[]>(
    []
  );
  const [searchNumber, setSearchNumber] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"scanner" | "records">("scanner");
  const [tokenRemainingTime, setTokenRemainingTime] = useState<number | null>(
    null
  );
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedExportSession, setSelectedExportSession] =
    useState<string>("");
  const [exportSuccess, setExportSuccess] = useState<{
    show: boolean;
    sessionName: string;
    recordCount: number;
    sheetUrl: string;
  }>({
    show: false,
    sessionName: "",
    recordCount: 0,
    sheetUrl: "",
  });

  // 교육 회차 목록
  const sessionOptions: Array<{ value: string; label: string }> = [
    { value: "", label: "전체 회차" },
  ];

  for (let week = 1; week <= 22; week++) {
    for (let session = 1; session <= 3; session++) {
      sessionOptions.push({
        value: `${week}-${session}`,
        label: `${week}-${session}회차`,
      });
    }
  }

  // 현재 날짜를 YYYY-MM-DD 형식으로 반환하는 함수
  function getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // 인증 확인 및 출석 데이터 로드
  useEffect(() => {
    const checkAuth = async () => {
      const token = getToken();

      if (!token) {
        // 로그인되지 않은 경우 로그인 페이지로 리다이렉트
        toast.error("로그인이 필요합니다.");
        router.push("/login");
        return;
      }

      // 초기 출석 데이터 로드
      await loadAttendanceData();
    };

    checkAuth();
  }, []);

  // 선택한 날짜에 따라 출석 데이터 로드
  useEffect(() => {
    if (getToken()) {
      loadAttendanceData();
    }
  }, [selectedDate, selectedSessionId]);

  // 토큰 만료 시간 주기적 업데이트
  useEffect(() => {
    const updateTokenTime = () => {
      const remainingTime = getTokenRemainingTime();
      setTokenRemainingTime(remainingTime);

      // 토큰이 만료되었거나 5분 미만으로 남은 경우 경고 표시
      if (remainingTime !== null && remainingTime < 300 && remainingTime > 0) {
        toast.warn(
          `로그인이 곧 만료됩니다. 연장하세요! (${formatTime(remainingTime)})`
        );
      } else if (remainingTime !== null && remainingTime <= 0) {
        toast.error("로그인이 만료되었습니다. 다시 로그인해주세요.");
        removeToken();
        router.push("/login");
      }
    };

    // 초기 실행
    updateTokenTime();

    // 1초마다 업데이트
    const interval = setInterval(updateTokenTime, 1000);

    return () => clearInterval(interval);
  }, [router]);

  // 시간 포맷팅 함수 (초 -> HH:MM:SS)
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}시간 ${minutes}분 ${remainingSeconds}초`;
    } else if (minutes > 0) {
      return `${minutes}분 ${remainingSeconds}초`;
    } else {
      return `${remainingSeconds}초`;
    }
  };

  const loadAttendanceData = async () => {
    setLoading(true);

    try {
      const result = await api.getAttendanceByDate(
        selectedDate,
        selectedSessionId || undefined
      );

      if (result.success && result.data) {
        if (result.data.data) {
          // API 응답 구조에 맞게 데이터 추출 후 최신 시간순으로 정렬
          const sortedData = result.data.data.sort(
            (a: AttendanceRecord, b: AttendanceRecord) => {
              // timestamp 또는 date+time 조합으로 정렬
              const dateTimeA = a.timestamp || `${a.date} ${a.time}`;
              const dateTimeB = b.timestamp || `${b.date} ${b.time}`;
              return (
                new Date(dateTimeB).getTime() - new Date(dateTimeA).getTime()
              );
            }
          );

          setAttendanceRecords(sortedData);
          setFilteredRecords(sortedData);
        } else {
          setAttendanceRecords([]);
          setFilteredRecords([]);
        }
      } else {
        toast.error(result.error || "출석 데이터를 불러오는데 실패했습니다.");
      }
    } catch (error) {
      console.error("출석 데이터 로드 오류:", error);
      toast.error("출석 데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 검색 기능
  const handleSearch = (searchValue: string) => {
    setSearchNumber(searchValue);

    if (!searchValue.trim()) {
      // 검색어가 없으면 전체 기록 표시
      setFilteredRecords(attendanceRecords);
    } else {
      // 출석번호로 필터링
      const filtered = attendanceRecords.filter((record) =>
        record.studentNumber.toString().includes(searchValue.trim())
      );
      setFilteredRecords(filtered);
    }
  };

  // 검색어 변경 시 실시간 필터링
  useEffect(() => {
    handleSearch(searchNumber);
  }, [attendanceRecords, searchNumber]);

  const handleLogout = () => {
    removeToken();
    toast.info("로그아웃되었습니다.");
    router.push("/login");
  };

  // 로그인 연장 처리
  const handleRefreshToken = async () => {
    setRefreshLoading(true);
    try {
      const result = await api.refreshToken();
      if (result.success) {
        toast.success("로그인이 연장되었습니다.");
        // 토큰 시간 즉시 업데이트
        const remainingTime = getTokenRemainingTime();
        setTokenRemainingTime(remainingTime);
      } else {
        if (result.needRelogin) {
          toast.error("세션을 연장할 수 없습니다. 다시 로그인해주세요.");
          // 5초 후 로그인 페이지로 리다이렉트
          setTimeout(() => {
            removeToken();
            router.push("/login");
          }, 5000);
        } else {
          toast.error(result.error || "로그인 연장에 실패했습니다.");
        }
      }
    } catch (error) {
      console.error("토큰 갱신 오류:", error);
      toast.error("로그인 연장 중 오류가 발생했습니다.");
    } finally {
      setRefreshLoading(false);
    }
  };

  // 특정 회차의 출석 데이터 로드
  const loadAttendanceDataForSession = async (
    sessionId: string,
    date: string = selectedDate
  ) => {
    try {
      console.log(`데이터 로드 요청: 회차=${sessionId}, 날짜=${date}`);
      const result = await api.getAttendanceByDate(
        date,
        sessionId || undefined
      );

      if (result.success && result.data) {
        if (result.data.data) {
          console.log(`받은 데이터 건수: ${result.data.data.length}건`);
          console.log(`받은 데이터 샘플:`, result.data.data.slice(0, 3));

          // 클라이언트 사이드에서 한 번 더 필터링 (안전장치)
          const filteredData = result.data.data.filter(
            (record: any) => !sessionId || record.sessionId === sessionId
          );

          // 최신 시간순으로 정렬
          const sortedData = filteredData.sort((a: any, b: any) => {
            const dateTimeA = a.timestamp || `${a.date} ${a.time}`;
            const dateTimeB = b.timestamp || `${b.date} ${b.time}`;
            return (
              new Date(dateTimeB).getTime() - new Date(dateTimeA).getTime()
            );
          });

          console.log(`필터링 후 데이터 건수: ${sortedData.length}건`);
          return sortedData;
        } else {
          return [];
        }
      } else {
        throw new Error(
          result.error || "출석 데이터를 불러오는데 실패했습니다."
        );
      }
    } catch (error) {
      console.error("출석 데이터 로드 오류:", error);
      throw error;
    }
  };

  // 구글 스프레드시트로 내보내기 (회차 선택 후)
  const handleExportToGoogleSheetsWithRefresh = async () => {
    if (!selectedExportSession) {
      toast.warn("내보낼 회차를 선택해주세요.");
      return;
    }

    setExportLoading(true);

    try {
      // 1. 선택된 회차의 최신 데이터 로드
      console.log(`회차 ${selectedExportSession}의 데이터를 새로고침 중...`);
      const freshData = await loadAttendanceDataForSession(
        selectedExportSession,
        selectedDate
      );

      if (freshData.length === 0) {
        toast.warn(`${selectedExportSession}회차의 출석 데이터가 없습니다.`);
        setExportLoading(false);
        return;
      }

      console.log(`업로드할 데이터: ${freshData.length}건`);
      console.log(
        `업로드할 데이터 세부내용:`,
        freshData.map((record: AttendanceRecord) => ({
          number: record.studentNumber,
          session: record.sessionId,
          date: record.date,
          time: record.time,
        }))
      );

      // 2. 회차 이름 결정
      const sessionName = selectedExportSession
        ? sessionOptions.find(
            (option) => option.value === selectedExportSession
          )?.label || selectedExportSession
        : `전체회차_${selectedDate}`;

      // 3. 데이터를 배열 형태로 변환
      const csvData = [
        ["출석번호", "날짜", "시간", "회차"], // 헤더
        ...freshData.map((record: any) => [
          record.studentNumber,
          record.date,
          record.time,
          record.sessionId
            ? sessionOptions.find((option) => option.value === record.sessionId)
                ?.label || record.sessionId
            : "정보 없음",
        ]),
      ];

      console.log(`CSV 데이터 (헤더 포함): ${csvData.length}행`);
      console.log(`CSV 데이터 미리보기:`, csvData.slice(0, 5));

      // 4. 구글 시트 API 호출
      console.log(`구글 시트에 ${csvData.length - 1}건의 데이터 업로드 중...`);
      const result = await api.exportToGoogleSheets(sessionName, csvData);

      if (result.success) {
        // 내보내기 성공 후 현재 화면도 업데이트
        if (selectedSessionId === selectedExportSession) {
          setAttendanceRecords(freshData);
          setFilteredRecords(freshData);
        }
        setExportSuccess({
          show: true,
          sessionName: sessionName,
          recordCount: freshData.length,
          sheetUrl: result.sheetUrl || "",
        });
      } else {
        toast.error(result.error || "구글 시트 내보내기에 실패했습니다.");
      }

      // 모달 닫기
      setShowExportModal(false);
      setSelectedExportSession("");
    } catch (error) {
      console.error("내보내기 오류:", error);
      toast.error("데이터 로드 또는 내보내기 중 오류가 발생했습니다.");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer position="top-right" autoClose={5000} />

      {/* QR 스캐너용 플로팅 버튼들 */}
      {activeTab === "scanner" && (
        <>
          {/* 상단 우측: 탭 전환 버튼 */}
          <div className="fixed top-4 right-4 z-50 flex gap-2">
            <button
              onClick={() => setActiveTab("records")}
              className="px-3 py-2 bg-white text-gray-700 rounded-lg shadow-lg hover:bg-gray-50 transition-colors flex items-center gap-2 border border-gray-200"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                />
              </svg>
              <span className="hidden sm:inline">출석 기록</span>
            </button>
          </div>

          {/* 상단 좌측: 세션 정보 */}
          <div className="fixed top-4 left-4 z-50">
            {tokenRemainingTime !== null && (
              <div className="flex items-center bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
                <div
                  className={`text-xs sm:text-sm font-medium px-3 py-2 ${
                    tokenRemainingTime > 300
                      ? "bg-green-50 text-green-700 border-r border-gray-200"
                      : "bg-red-50 text-red-700 border-r border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="hidden sm:inline">세션:</span>
                    <span className="font-mono">
                      {formatTime(tokenRemainingTime)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleRefreshToken}
                  disabled={refreshLoading}
                  className={`px-3 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-gray-50 text-indigo-600 transition-colors flex items-center ${
                    refreshLoading ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                  title="세션을 연장하려면 클릭하세요"
                >
                  {refreshLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* 하단 우측: 로그아웃 버튼 */}
          <div className="fixed bottom-4 right-4 z-50">
            <button
              onClick={handleLogout}
              className="px-3 py-2 text-xs sm:text-sm font-medium text-red-600 bg-white border border-gray-200 rounded-lg shadow-lg hover:bg-red-50 transition-colors flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V9a1 1 0 10-2 0v6H4V5h8a1 1 0 100-2H3zm9.707 5.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 11H15a1 1 0 100-2h-4.586l2.293-2.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>

          {/* 하단 좌측: Copyright */}
          <div className="fixed bottom-4 left-4 z-40">
            <div className="bg-white bg-opacity-90 backdrop-blur-sm border border-gray-200 rounded-lg px-4 py-2 shadow-lg">
              <p className="text-xs text-gray-600">
                © 2025 교육출결관리시스템 by IntheK. All rights reserved.
              </p>
            </div>
          </div>
        </>
      )}

      <main
        className={
          activeTab === "scanner"
            ? "w-full h-screen"
            : "w-full h-screen bg-gray-50"
        }
      >
        {/* 탭 네비게이션 */}
        {activeTab !== "scanner" && (
          <div className="bg-white shadow-sm border-b border-gray-200 px-4 sm:px-6 lg:px-8">
            <div className="max-w-7xl mx-auto">
              <div className="flex justify-between items-center py-4">
                <h1 className="text-2xl font-bold text-gray-900">
                  교육 관리 시스템
                </h1>
                <div className="flex items-center gap-4">
                  {tokenRemainingTime !== null && (
                    <div className="flex items-center bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                      <div
                        className={`text-sm font-medium px-3 py-1.5 ${
                          tokenRemainingTime > 300
                            ? "bg-green-50 text-green-700 border-r border-gray-200"
                            : "bg-red-50 text-red-700 border-r border-gray-200"
                        }`}
                      >
                        <span className="hidden md:inline">세션 만료:</span>{" "}
                        {formatTime(tokenRemainingTime)}
                      </div>
                      <button
                        onClick={handleRefreshToken}
                        disabled={refreshLoading}
                        className={`px-3 py-1.5 text-sm font-medium bg-white hover:bg-gray-50 text-indigo-600 transition-colors flex items-center ${
                          refreshLoading ? "opacity-70 cursor-not-allowed" : ""
                        }`}
                        title="세션을 연장하려면 클릭하세요"
                      >
                        {refreshLoading ? (
                          "연장 중..."
                        ) : (
                          <>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 mr-1"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <path
                                fillRule="evenodd"
                                d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                                clipRule="evenodd"
                              />
                            </svg>
                            연장
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-red-50 transition-colors flex items-center"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V9a1 1 0 10-2 0v6H4V5h8a1 1 0 100-2H3zm9.707 5.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 11H15a1 1 0 100-2h-4.586l2.293-2.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    로그아웃
                  </button>
                </div>
              </div>
              <nav className="flex space-x-8 border-t border-gray-200 pt-4">
                <button
                  onClick={() => setActiveTab("scanner")}
                  className={`pb-4 px-1 text-base font-medium border-b-2 transition-colors ${
                    (activeTab as string) === "scanner"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300"
                  }`}
                >
                  QR 스캐너
                </button>
                <button
                  onClick={() => setActiveTab("records")}
                  className={`pb-4 px-1 text-base font-medium border-b-2 transition-colors ${
                    (activeTab as string) === "records"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300"
                  }`}
                >
                  출석 기록
                </button>
              </nav>
            </div>
          </div>
        )}

        {/* 탭 컨텐츠 */}
        <div
          className={
            activeTab === "scanner"
              ? "w-full h-full"
              : "w-full h-full overflow-hidden"
          }
        >
          {activeTab === "scanner" ? (
            <div className="w-full h-full">
              <QRScanner />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col bg-white">
              <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 py-4 border-b border-gray-200 bg-gray-50">
                <div className="max-w-7xl mx-auto">
                  <div className="flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-4">
                      <h2 className="text-xl font-semibold text-gray-900">
                        출석 기록
                      </h2>
                      {/* 전체 출석 수 표시 */}
                      <div className="flex items-center gap-2 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 20h5v-2a3 3 0 00-5.196-2.121M9 20H4v-2a3 3 0 015.196-2.121m0 0a5.002 5.002 0 019.608 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span>총 {attendanceRecords.length}명 출석</span>
                      </div>
                      {/* 리프레시 버튼 */}
                      <button
                        onClick={loadAttendanceData}
                        disabled={loading}
                        className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                          loading
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800"
                        }`}
                        title="출석 기록 새로고침"
                      >
                        <svg
                          className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                        <span className="hidden sm:inline">
                          {loading ? "새로고침 중..." : "새로고침"}
                        </span>
                      </button>
                      {/* 구글 시트 내보내기 버튼 */}
                      <button
                        onClick={() => setShowExportModal(true)}
                        disabled={
                          exportLoading || attendanceRecords.length === 0
                        }
                        className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                          exportLoading || attendanceRecords.length === 0
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
                        }`}
                        title="구글 스프레드시트로 내보내기"
                      >
                        <svg
                          className={`w-4 h-4 ${
                            exportLoading ? "animate-spin" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          {exportLoading ? (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          ) : (
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          )}
                        </svg>
                        <span className="hidden sm:inline">
                          {exportLoading
                            ? "내보내는 중..."
                            : "구글 시트 내보내기"}
                        </span>
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {/* 검색 입력 필드 */}
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg
                            className="h-4 w-4 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                          </svg>
                        </div>
                        <input
                          type="text"
                          placeholder="출석번호 검색..."
                          value={searchNumber}
                          onChange={(e) => handleSearch(e.target.value)}
                          className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        {searchNumber && (
                          <button
                            onClick={() => handleSearch("")}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center"
                          >
                            <svg
                              className="h-4 w-4 text-gray-400 hover:text-gray-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                      {/* 날짜 선택 */}
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      {/* 교육 회차 선택 */}
                      <select
                        value={selectedSessionId}
                        onChange={(e) => setSelectedSessionId(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {sessionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 검색 결과 정보 */}
                {searchNumber && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-800">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span>
                      "{searchNumber}" 검색 결과:{" "}
                      <span className="font-semibold text-gray-900">
                        {filteredRecords.length}건
                      </span>
                      {attendanceRecords.length > 0 && (
                        <span className="text-gray-600">
                          {" "}
                          (전체 {attendanceRecords.length}건 중)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-hidden">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                      <p className="text-gray-600 font-medium">로딩 중...</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full overflow-auto">
                    {filteredRecords.length > 0 ? (
                      <div className="px-4 sm:px-6 lg:px-8 py-6">
                        <div className="max-w-7xl mx-auto">
                          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-indigo-50">
                                <tr>
                                  <th
                                    scope="col"
                                    className="px-6 py-4 text-left text-xs font-bold text-indigo-800 uppercase tracking-wider"
                                  >
                                    출석번호
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-6 py-4 text-left text-xs font-bold text-indigo-800 uppercase tracking-wider"
                                  >
                                    날짜
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-6 py-4 text-left text-xs font-bold text-indigo-800 uppercase tracking-wider"
                                  >
                                    시간
                                  </th>
                                  <th
                                    scope="col"
                                    className="px-6 py-4 text-left text-xs font-bold text-indigo-800 uppercase tracking-wider"
                                  >
                                    회차
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {filteredRecords.map((record, index) => (
                                  <tr
                                    key={index}
                                    className={`${
                                      index % 2 === 0
                                        ? "bg-white"
                                        : "bg-indigo-50"
                                    } hover:bg-indigo-100 transition-colors duration-150`}
                                  >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                      {record.studentNumber}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                      {record.date}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                      {record.time}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                      {record.sessionId
                                        ? sessionOptions.find(
                                            (option) =>
                                              option.value === record.sessionId
                                          )?.label || record.sessionId
                                        : "정보 없음"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                            <svg
                              className="w-8 h-8 text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              {searchNumber ? (
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                />
                              ) : (
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                                />
                              )}
                            </svg>
                          </div>
                          <h3 className="text-lg font-semibold text-gray-700 mb-2">
                            {searchNumber
                              ? "검색 결과가 없습니다"
                              : "출석 기록이 없습니다"}
                          </h3>
                          <p className="text-gray-500">
                            {searchNumber
                              ? `"${searchNumber}"와 일치하는 출석번호가 없습니다.`
                              : "해당 날짜에 출석 기록이 없습니다."}
                          </p>
                          {searchNumber && (
                            <button
                              onClick={() => handleSearch("")}
                              className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                            >
                              전체 기록 보기
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Copyright */}
              <div className="flex-shrink-0 bg-gray-50 border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-3">
                <div className="max-w-7xl mx-auto">
                  <p className="text-xs text-gray-500 text-center">
                    © 2025 교육출결관리시스템 by IntheK. All rights reserved.
                  </p>
                </div>
              </div>

              {/* 구글 시트 내보내기 모달 */}
              {showExportModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-xl border-2 border-indigo-200 p-6 w-full max-w-md mx-4">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        구글 시트로 내보내기
                      </h3>
                      <p className="text-sm text-gray-600">
                        내보낼 회차를 선택하세요.
                      </p>
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        회차 선택
                      </label>
                      <select
                        value={selectedExportSession}
                        onChange={(e) =>
                          setSelectedExportSession(e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        disabled={exportLoading}
                      >
                        <option value="">회차를 선택하세요</option>
                        {sessionOptions.slice(1).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => {
                          setShowExportModal(false);
                          setSelectedExportSession("");
                        }}
                        disabled={exportLoading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        취소
                      </button>
                      <button
                        onClick={handleExportToGoogleSheetsWithRefresh}
                        disabled={exportLoading || !selectedExportSession}
                        className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2 ${
                          exportLoading || !selectedExportSession
                            ? "bg-gray-400 cursor-not-allowed"
                            : "bg-blue-600 hover:bg-blue-700"
                        }`}
                      >
                        {exportLoading && (
                          <svg
                            className="w-4 h-4 animate-spin"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        )}
                        {exportLoading ? "업로드 중..." : "내보내기"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 내보내기 성공 모달 */}
              {exportSuccess.show && (
                <div className="fixed inset-0 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-xl border-2 border-green-200 p-6 w-full max-w-md mx-4">
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                        <svg
                          className="w-8 h-8 text-green-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        업로드 완료!
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        <span className="font-medium">
                          {exportSuccess.sessionName}
                        </span>
                        의 출석 기록
                        <span className="font-medium">
                          {" "}
                          {exportSuccess.recordCount}건
                        </span>
                        이 구글 시트에 성공적으로 업로드되었습니다.
                      </p>

                      <div className="flex flex-col gap-3">
                        <a
                          href={exportSuccess.sheetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                          구글 시트에서 보기
                        </a>
                        <button
                          onClick={() =>
                            setExportSuccess({
                              show: false,
                              sessionName: "",
                              recordCount: 0,
                              sheetUrl: "",
                            })
                          }
                          className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          닫기
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
