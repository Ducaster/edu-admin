"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "../services/api";
import React from "react";

// 모달 알림 컴포넌트
interface AlertModalProps {
  isOpen: boolean;
  type: "success" | "error";
  message: string;
  onClose: () => void;
}

const AlertModal = ({ isOpen, type, message, onClose }: AlertModalProps) => {
  useEffect(() => {
    if (isOpen && type === "success") {
      const timer = setTimeout(() => {
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, type, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      ></div>
      <div
        className={`relative rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 ${
          type === "success" ? "bg-white" : "bg-white"
        }`}
      >
        <div className="flex items-center">
          <div
            className={`flex-shrink-0 h-12 w-12 rounded-full flex items-center justify-center ${
              type === "success" ? "bg-green-100" : "bg-red-100"
            }`}
          >
            {type === "success" ? (
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
            ) : (
              <svg
                className="h-8 w-8 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            )}
          </div>
          <div className="ml-4">
            <h3
              className={`text-lg font-bold ${
                type === "success" ? "text-green-800" : "text-red-800"
              }`}
            >
              {type === "success" ? "성공" : "오류"}
            </h3>
            <p className="text-gray-700 mt-1">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium text-white ${
              type === "success"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {type === "success" ? "확인" : "닫기"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isError, setIsError] = useState(false);

  // CSS 애니메이션을 위한 상태
  const [shake, setShake] = useState(false);

  // 진동 효과 함수
  const triggerShake = () => {
    setShake(true);
    setTimeout(() => {
      setShake(false);
    }, 500);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setIsError(false);

    if (!username || !password) {
      setErrorMessage("아이디와 비밀번호를 모두 입력해주세요.");
      setIsError(true);
      triggerShake();
      return;
    }

    setLoading(true);
    console.log("로그인 시도:", { username, password: "******" });

    try {
      const result = await api.login(username, password);
      console.log("로그인 결과:", result);

      if (result.success) {
        // 성공 시 바로 대시보드로 이동
        router.push("/dashboard");
      } else {
        console.error("로그인 실패:", result.error);

        // 오류 메시지 처리
        let errorMsg = "";
        if (result.error.includes("인증에 실패")) {
          errorMsg = "아이디 또는 비밀번호가 일치하지 않습니다.";
        } else if (result.error.includes("Internal server error")) {
          errorMsg = "서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
        } else {
          errorMsg = result.error || "로그인에 실패했습니다.";
        }

        setErrorMessage(errorMsg);
        setIsError(true);
        triggerShake();
      }
    } catch (error) {
      console.error("로그인 오류:", error);
      const errorMsg = "로그인 중 오류가 발생했습니다.";
      setErrorMessage(errorMsg);
      setIsError(true);
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <style jsx global>{`
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          10%,
          30%,
          50%,
          70%,
          90% {
            transform: translateX(-5px);
          }
          20%,
          40%,
          60%,
          80% {
            transform: translateX(5px);
          }
        }
        .shake-animation {
          animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }
      `}</style>

      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-lg">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-extrabold text-black">관리자 로그인</h1>
          <p className="mt-2 text-base font-medium text-black">
            교육 관리 시스템에 접속하세요
          </p>
        </div>

        {errorMessage && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md">
            <div className="flex items-center">
              <div className="flex-shrink-0 text-red-500">
                <svg
                  className="h-5 w-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-bold text-red-800">{errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        <form
          className={`space-y-5 ${shake ? "shake-animation" : ""}`}
          onSubmit={handleLogin}
        >
          <div>
            <label
              htmlFor="username"
              className="block text-base font-bold text-black mb-1"
            >
              아이디
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`appearance-none block w-full px-3 py-3 border ${
                isError
                  ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                  : "border-gray-400 focus:ring-indigo-500 focus:border-indigo-500"
              } rounded-md shadow-sm text-black text-base focus:outline-none`}
              placeholder="아이디 입력"
              style={{ color: "black", fontWeight: "500" }}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-base font-bold text-black mb-1"
            >
              비밀번호
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`appearance-none block w-full px-3 py-3 border ${
                isError
                  ? "border-red-500 focus:ring-red-500 focus:border-red-500"
                  : "border-gray-400 focus:ring-indigo-500 focus:border-indigo-500"
              } rounded-md shadow-sm text-black text-base focus:outline-none`}
              placeholder="비밀번호 입력"
              style={{ color: "black", fontWeight: "500" }}
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-base font-medium text-white ${
                loading ? "bg-indigo-500" : "bg-indigo-600 hover:bg-indigo-700"
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200`}
            >
              {loading ? "로그인 중..." : "로그인"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
