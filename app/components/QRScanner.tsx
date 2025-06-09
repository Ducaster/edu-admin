"use client";

import { useEffect, useState, useRef } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { api } from "../services/api";
import { toast } from "react-toastify";

let html5QrCode: Html5Qrcode;
let lastGlobalScanTime = 0; // 전역 마지막 스캔 시간 (0.8초 차단용)

// QR 코드 위치 정보 인터페이스
interface QRLocation {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

export default function QRScanner() {
  const [scanning, setScanning] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("1-1"); // 기본값 설정
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<number>(0);
  const [lastProcessedNumber, setLastProcessedNumber] = useState<number | null>(
    null
  ); // 마지막 처리된 출석번호
  const [lastProcessedTime, setLastProcessedTime] = useState<number>(0); // 마지막 처리 시간
  const [isProcessing, setIsProcessing] = useState(false); // API 처리 중 플래그
  const [attendanceHistory, setAttendanceHistory] = useState<
    Array<{
      number: number;
      timestamp: string;
      id: string;
      sessionId: string; // sessionId 추가
    }>
  >([]);
  const [permissionError, setPermissionError] = useState(false);
  const [qrLocation, setQrLocation] = useState<QRLocation | null>(null);
  const [animateQR, setAnimateQR] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"user" | "environment">(
    "user"
  ); // 카메라 방향 상태

  // 카메라 장치 상태 관리
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [frontCamera, setFrontCamera] = useState<string | null>(null);
  const [backCamera, setBackCamera] = useState<string | null>(null);
  const [cameraListLoaded, setCameraListLoaded] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(
    null
  );

  const scannerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // 교육 회차 목록 (1-1부터 22-3까지)
  const sessionOptions: Array<{ value: string; label: string }> = [];
  for (let week = 1; week <= 22; week++) {
    for (let session = 1; session <= 3; session++) {
      sessionOptions.push({
        value: `${week}-${session}`,
        label: `${week}-${session}회차`,
      });
    }
  }

  // 카메라 장치 목록 미리 불러오기 (안전한 방식)
  useEffect(() => {
    const loadCameraDevices = async () => {
      try {
        // 권한 없이도 기본 장치 목록 시도
        let devices = await navigator.mediaDevices.enumerateDevices();
        let videoInputs = devices.filter(
          (device) => device.kind === "videoinput"
        );

        // 권한 없으면 라벨이 비어있을 수 있으므로 권한 요청 후 다시 시도
        if (videoInputs.length > 0 && !videoInputs[0].label) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: true,
            });
            stream.getTracks().forEach((track) => track.stop());
            // 권한 후 다시 장치 목록 가져오기
            devices = await navigator.mediaDevices.enumerateDevices();
            videoInputs = devices.filter(
              (device) => device.kind === "videoinput"
            );
          } catch (permError) {
            // 권한 거부되어도 계속 진행
          }
        }

        setVideoDevices(videoInputs);

        // 전면/후면 카메라 구분 (더 관대한 방식)
        let frontCameraId = null;
        let backCameraId = null;

        for (const device of videoInputs) {
          const label = device.label.toLowerCase();

          // 전면 카메라 감지 (더 많은 키워드)
          if (
            label.includes("front") ||
            label.includes("user") ||
            label.includes("selfie") ||
            label.includes("내부") ||
            label.includes("facetime") ||
            label.includes("face")
          ) {
            frontCameraId = device.deviceId;
          }
          // 후면 카메라 감지
          else if (
            label.includes("back") ||
            label.includes("rear") ||
            label.includes("environment") ||
            label.includes("외부") ||
            label.includes("main") ||
            label.includes("camera 0") ||
            (!label.includes("front") && !label.includes("user"))
          ) {
            backCameraId = device.deviceId;
          }
        }

        // 기본값 설정 (라벨로 구분 못한 경우)
        if (videoInputs.length >= 2) {
          if (!frontCameraId) frontCameraId = videoInputs[0].deviceId;
          if (!backCameraId) backCameraId = videoInputs[1].deviceId;
        } else if (videoInputs.length >= 1) {
          if (!frontCameraId && !backCameraId) {
            // 카메라가 하나뿐이면 둘 다 같은 것으로 설정
            frontCameraId = backCameraId = videoInputs[0].deviceId;
          }
        }

        setFrontCamera(frontCameraId);
        setBackCamera(backCameraId);
      } catch (error) {
        console.error("카메라 장치 로드 오류:", error);
        // 오류 시에도 기본 동작할 수 있도록
        setFrontCamera(null);
        setBackCamera(null);
      } finally {
        setCameraListLoaded(true);
      }
    };

    loadCameraDevices();
  }, []);

  useEffect(() => {
    // 컴포넌트가 마운트될 때 QR 스캐너 초기화
    const qrCodeId = "qr-reader";

    if (!document.getElementById(qrCodeId)) {
      const container = document.createElement("div");
      container.id = qrCodeId;
      document.getElementById("qr-container")?.appendChild(container);
    }

    html5QrCode = new Html5Qrcode(qrCodeId);

    // 컴포넌트 언마운트 시 QR 스캐너 정리
    return () => {
      if (html5QrCode?.isScanning) {
        html5QrCode
          .stop()
          .catch((err) => console.error("스캐너 종료 오류:", err));
      }
    };
  }, []);

  // QR 코드 감지 시 하이라이트 애니메이션 효과
  useEffect(() => {
    if (qrLocation) {
      setAnimateQR(true);
      const timer = setTimeout(() => {
        setAnimateQR(false);
      }, 1000); // 1초로 증가
      return () => clearTimeout(timer);
    }
  }, [qrLocation]);

  // 카메라 권한 확인
  const checkCameraPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      setPermissionError(false);
      return true;
    } catch (error) {
      console.error("카메라 권한 확인 오류:", error);
      setPermissionError(true);

      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          toast.error(
            "카메라 접근이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요."
          );
        } else if (error.name === "NotFoundError") {
          toast.error(
            "카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인해주세요."
          );
        } else {
          toast.error(`카메라 오류: ${error.message}`);
        }
      } else {
        toast.error("카메라에 접근할 수 없습니다.");
      }

      return false;
    }
  };

  const startScanner = async () => {
    // 카메라 목록이 로드될 때까지 대기
    if (!cameraListLoaded) {
      toast.info("카메라 장치를 불러오는 중입니다...");
      return;
    }

    try {
      setScanning(true);
      setQrLocation(null);

      // 텔레그램 스타일 스캐너 설정
      const config = {
        fps: 8,
        qrbox: undefined,
        aspectRatio: 16 / 9,
        disableFlip: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      };

      // 단계적 fallback 시스템으로 카메라 시작 시도
      const targetDeviceId = cameraFacing === "user" ? frontCamera : backCamera;

      // 시도할 제약 조건들 (우선순위 순) - 초점 개선 포함
      const constraintAttempts = [];

      // 모바일용 고품질 설정 (초점 개선)
      const mobileConstraints = {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 30, max: 30 },
      };

      // 1. deviceId exact + 모바일 최적화
      if (targetDeviceId) {
        constraintAttempts.push({
          name: "deviceId exact + mobile optimized",
          constraints: {
            deviceId: { exact: targetDeviceId },
            ...mobileConstraints,
          },
        });
      }

      // 2. deviceId exact (기본)
      if (targetDeviceId) {
        constraintAttempts.push({
          name: "deviceId exact",
          constraints: { deviceId: { exact: targetDeviceId } },
        });
      }

      // 3. facingMode exact + 모바일 최적화
      constraintAttempts.push({
        name: "facingMode exact + mobile optimized",
        constraints: {
          facingMode: { exact: cameraFacing },
          ...mobileConstraints,
        },
      });

      // 4. facingMode exact (기본)
      constraintAttempts.push({
        name: "facingMode exact",
        constraints: { facingMode: { exact: cameraFacing } },
      });

      // 5. deviceId ideal (유연한 방식)
      if (targetDeviceId) {
        constraintAttempts.push({
          name: "deviceId ideal",
          constraints: { deviceId: { ideal: targetDeviceId } },
        });
      }

      // 6. facingMode ideal (유연한 facing)
      constraintAttempts.push({
        name: "facingMode ideal",
        constraints: { facingMode: { ideal: cameraFacing } },
      });

      // 7. facingMode 기본 (가장 기본적인 방식)
      constraintAttempts.push({
        name: "facingMode basic",
        constraints: { facingMode: cameraFacing },
      });

      // 8. 마지막 fallback (기본 비디오만)
      constraintAttempts.push({
        name: "basic video",
        constraints: { video: true },
      });

      let lastError = null;
      let success = false;

      // 각 제약 조건을 순차적으로 시도
      for (const attempt of constraintAttempts) {
        try {
          await html5QrCode.start(
            attempt.constraints,
            config,
            onScanSuccess,
            onScanFailure
          );
          success = true;
          break; // 성공하면 중단
        } catch (error) {
          lastError = error;
          console.warn(`${attempt.name} 방식 실패:`, error);

          // 스캐너가 이미 시작된 상태라면 중지하고 다음 시도
          if (html5QrCode?.isScanning) {
            try {
              await html5QrCode.stop();
            } catch (stopError) {
              console.warn("스캐너 중지 실패:", stopError);
            }
          }

          // 짧은 대기 후 다음 시도
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      if (!success) {
        throw lastError || new Error("모든 카메라 시작 방식이 실패했습니다.");
      }
    } catch (error) {
      console.error("QR 스캐너 시작 오류:", error);

      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          toast.error(
            "카메라 접근 권한이 거부되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요."
          );
          setPermissionError(true);
        } else if (error.name === "NotFoundError") {
          toast.error(
            "카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인해주세요."
          );
        } else {
          toast.error(`카메라 오류: ${error.message}`);
        }
      } else {
        toast.error(
          "QR 스캐너를 시작할 수 없습니다. 새로고침 후 다시 시도해주세요."
        );
      }

      setScanning(false);
    }
  };

  const stopScanner = async () => {
    try {
      if (html5QrCode?.isScanning) {
        await html5QrCode.stop();
      }
      setScanning(false);
      setQrLocation(null);
      setFocusPoint(null);
    } catch (error) {
      console.error("QR 스캐너 종료 오류:", error);
    }
  };

  // 터치로 포커스 맞추기
  const handleCameraTouch = async (event: React.TouchEvent) => {
    if (!scanning) return;

    event.preventDefault();
    const touch = event.touches[0];
    const rect = event.currentTarget.getBoundingClientRect();

    // 터치 좌표를 상대 좌표로 변환
    const x = ((touch.clientX - rect.left) / rect.width) * 100;
    const y = ((touch.clientY - rect.top) / rect.height) * 100;

    setFocusPoint({ x, y });

    // 포커스 표시 1초 후 사라짐
    setTimeout(() => setFocusPoint(null), 1000);

    try {
      // MediaStream에서 video track 가져오기
      const videoElement = document.querySelector(
        "#qr-reader video"
      ) as HTMLVideoElement;
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        const videoTrack = stream.getVideoTracks()[0];

        // 포커스 기능이 지원되는지 확인 (안전한 타입 체크)
        const capabilities = videoTrack.getCapabilities() as any;
        if (capabilities.focusMode) {
          try {
            // continuous 포커스 시도
            await videoTrack.applyConstraints({
              advanced: [{ focusMode: "continuous" }] as any,
            });

            toast.success("🎯 포커스를 조정했습니다", {
              autoClose: 1000,
              toastId: "focus-adjusted",
            });
          } catch (focusError) {
            // 포커스 설정 실패 시 무시
            console.warn("포커스 모드 설정 실패:", focusError);
          }
        }
      }
    } catch (error) {
      console.warn("포커스 조정 실패:", error);
      // 실패해도 토스트는 표시하지 않음 (사용자 경험 방해 방지)
    }
  };

  // 카메라 전환 함수 (단계적 fallback 시스템)
  const switchCamera = async () => {
    if (!scanning) return;

    const newFacing = cameraFacing === "user" ? "environment" : "user";
    const targetDeviceId = newFacing === "user" ? frontCamera : backCamera;

    // 하나의 카메라만 있는 경우
    if (videoDevices.length < 2) {
      toast.warn("이 기기에는 카메라가 하나만 있습니다.");
      return;
    }

    try {
      // 현재 스캐너 중지
      await stopScanner();

      // 카메라 방향 전환
      setCameraFacing(newFacing);

      // 대기 시간 (카메라 해제 완료)
      const delay = /Android/i.test(navigator.userAgent) ? 1000 : 500;

      setTimeout(async () => {
        try {
          setScanning(true);
          setQrLocation(null);

          const config = {
            fps: 8,
            qrbox: undefined,
            aspectRatio: 16 / 9,
            disableFlip: false,
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true,
            },
          };

          // 카메라 전환용 단계적 시도
          const switchAttempts = [];

          // 1. deviceId exact
          if (targetDeviceId) {
            switchAttempts.push({
              name: "deviceId exact",
              constraints: { deviceId: { exact: targetDeviceId } },
            });
          }

          // 2. deviceId ideal
          if (targetDeviceId) {
            switchAttempts.push({
              name: "deviceId ideal",
              constraints: { deviceId: { ideal: targetDeviceId } },
            });
          }

          // 3. facingMode exact
          switchAttempts.push({
            name: "facingMode exact",
            constraints: { facingMode: { exact: newFacing } },
          });

          // 4. facingMode ideal
          switchAttempts.push({
            name: "facingMode ideal",
            constraints: { facingMode: { ideal: newFacing } },
          });

          // 5. facingMode basic
          switchAttempts.push({
            name: "facingMode basic",
            constraints: { facingMode: newFacing },
          });

          let switchSuccess = false;
          let lastSwitchError = null;

          // 각 방식을 순차적으로 시도
          for (const attempt of switchAttempts) {
            try {
              await html5QrCode.start(
                attempt.constraints,
                config,
                onScanSuccess,
                onScanFailure
              );
              switchSuccess = true;
              break;
            } catch (error) {
              lastSwitchError = error;
              console.warn(`카메라 전환 ${attempt.name} 실패:`, error);

              if (html5QrCode?.isScanning) {
                try {
                  await html5QrCode.stop();
                } catch (stopError) {
                  console.warn("전환 중 스캐너 중지 실패:", stopError);
                }
              }

              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }

          if (switchSuccess) {
            toast.success(
              newFacing === "user"
                ? "전면 카메라로 전환되었습니다"
                : "후면 카메라로 전환되었습니다",
              { toastId: "camera-switch" }
            );
          } else {
            throw (
              lastSwitchError ||
              new Error("모든 카메라 전환 방식이 실패했습니다.")
            );
          }
        } catch (error) {
          console.error("카메라 전환 오류:", error);
          toast.error("카메라 전환에 실패했습니다. 다시 시도해주세요.");
          setScanning(false);
          setCameraFacing(cameraFacing === "user" ? "environment" : "user"); // 원래 상태로 복원
        }
      }, delay);
    } catch (error) {
      console.error("카메라 전환 준비 오류:", error);
      toast.error("카메라 전환 준비 중 오류가 발생했습니다.");
    }
  };

  const onScanSuccess = async (decodedText: string, decodedResult: any) => {
    const currentTime = Date.now();

    // QR 인식 즉시 1초간 스캔 차단
    if (currentTime - lastGlobalScanTime < 1000) {
      return;
    }

    // QR 인식 즉시 전역 시간 업데이트 (연속 스캔 방지)
    lastGlobalScanTime = currentTime;

    // API 처리 중이면 무시
    if (isProcessing) {
      return;
    }

    // 중복 스캔 방지 (같은 내용을 3초 이내에 다시 스캔하는 것 방지)
    if (decodedText === lastScanned && currentTime - lastScanTime < 3000) {
      return;
    }

    setLastScanTime(currentTime);
    setLastScanned(decodedText);
    setIsProcessing(true); // 처리 시작 플래그 설정

    // QR 코드 인식 시 강제로 하이라이트 효과 트리거
    setAnimateQR(true);
    setTimeout(() => {
      setAnimateQR(false);
    }, 1000);

    // QR 코드 위치 정보 업데이트
    if (decodedResult.result.cornerPoints && scannerRef.current) {
      const { width, height } = scannerRef.current.getBoundingClientRect();

      // cornerPoints에서 QR 코드 위치 정보 계산
      const points = decodedResult.result.cornerPoints;

      // 간소화된 위치 정보 생성 (실제 코드에서는 cornerPoints 사용)
      const location: QRLocation = {
        topLeft: {
          x: (points[0].x / width) * 100,
          y: (points[0].y / height) * 100,
        },
        topRight: {
          x: (points[1].x / width) * 100,
          y: (points[1].y / height) * 100,
        },
        bottomRight: {
          x: (points[2].x / width) * 100,
          y: (points[2].y / height) * 100,
        },
        bottomLeft: {
          x: (points[3].x / width) * 100,
          y: (points[3].y / height) * 100,
        },
      };

      setQrLocation(location);
    }

    try {
      // QR 코드에서 학생 번호 추출
      let studentNumber: number;

      // 다양한 형태의 QR 코드 처리
      if (decodedText.includes("student:") || decodedText.includes("학생:")) {
        // "student:12345" 또는 "학생:12345" 형태
        const match = decodedText.match(/(?:student:|학생:)(\d+)/i);
        if (match) {
          studentNumber = parseInt(match[1], 10);
        } else {
          toast.error("QR 코드에서 학생 번호를 찾을 수 없습니다.", {
            toastId: "parse-error",
          });
          return;
        }
      } else if (
        decodedText.includes("number:") ||
        decodedText.includes("번호:")
      ) {
        // "number:12345" 또는 "번호:12345" 형태
        const match = decodedText.match(/(?:number:|번호:)(\d+)/i);
        if (match) {
          studentNumber = parseInt(match[1], 10);
        } else {
          toast.error("QR 코드에서 학생 번호를 찾을 수 없습니다.", {
            toastId: "parse-error",
          });
          return;
        }
      } else if (/^\d+$/.test(decodedText.trim())) {
        // 순수 숫자만 있는 경우
        studentNumber = parseInt(decodedText.trim(), 10);
      } else {
        // JSON 형태인지 확인
        try {
          const jsonData = JSON.parse(decodedText);
          if (jsonData.number || jsonData.studentNumber || jsonData.id) {
            studentNumber = parseInt(
              jsonData.number || jsonData.studentNumber || jsonData.id,
              10
            );
          } else {
            toast.error(`지원하지 않는 QR 코드 형식입니다.`, {
              toastId: "unsupported-format",
            });
            return;
          }
        } catch {
          // 숫자 추출 시도
          const numberMatch = decodedText.match(/\d+/);
          if (numberMatch) {
            studentNumber = parseInt(numberMatch[0], 10);
          } else {
            toast.error(`QR 코드에서 숫자를 찾을 수 없습니다.`, {
              toastId: "no-number-found",
            });
            return;
          }
        }
      }

      if (isNaN(studentNumber) || studentNumber <= 0) {
        toast.error("유효하지 않은 학생 번호입니다.", {
          toastId: "invalid-number",
        });
        return;
      }

      // 같은 출석번호가 최근 5초 이내에 처리되었는지 확인
      if (
        lastProcessedNumber === studentNumber &&
        currentTime - lastProcessedTime < 5000
      ) {
        setIsProcessing(false); // 처리 완료 플래그 해제
        return;
      }

      // 출석 기록 API 호출
      const result = await api.recordAttendance(
        studentNumber,
        selectedSessionId
      );

      // 처리된 번호와 시간 업데이트 (성공/실패 관계없이)
      setLastProcessedNumber(studentNumber);
      setLastProcessedTime(currentTime);

      if (result.success) {
        toast.success("출석이 성공적으로 기록되었습니다.", {
          toastId: `success-${studentNumber}`,
          autoClose: 2000, // 토스트 표시 시간 단축
        });

        // 출석 기록을 히스토리에 추가
        const newRecord = {
          number: studentNumber,
          timestamp: new Date().toLocaleString(),
          id: `success-${Date.now()}-${studentNumber}`,
          sessionId: selectedSessionId,
        };
        setAttendanceHistory((prev) => [newRecord, ...prev]);

        // 성공 후 충분한 대기 시간 (2초)
        setTimeout(() => {
          setLastScanned(null);
          setQrLocation(null);
          setIsProcessing(false); // 처리 완료 플래그 해제
        }, 2000);
      } else {
        if (result.isDuplicate) {
          // 중복 출석인 경우 특별한 알림만 표시 (히스토리에는 추가하지 않음)
          toast.info("오늘 이미 출석한 이력이 있습니다.", {
            icon: () => <span>🔄</span>,
            style: { background: "#f0f9ff", color: "#0369a1" },
            toastId: `duplicate-${studentNumber}`,
            autoClose: 1500, // 중복 출석 알림 시간 단축
          });

          // 중복 출석 후 충분한 대기 시간 (1.5초)
          setTimeout(() => {
            setLastScanned(null);
            setQrLocation(null);
            setIsProcessing(false); // 처리 완료 플래그 해제
          }, 1500);
        } else {
          // 기타 오류
          const errorMessage = result.error || "출석 기록에 실패했습니다.";

          // 서버 오류인 경우 더 친화적인 메시지 표시
          if (
            errorMessage.includes("서버 내부 오류") ||
            errorMessage.includes("500")
          ) {
            toast.error(
              "서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
              {
                toastId: `server-error-${studentNumber}`,
                autoClose: 3000,
              }
            );
          } else if (errorMessage.includes("네트워크")) {
            toast.error("네트워크 연결을 확인해주세요.", {
              toastId: `network-error-${studentNumber}`,
              autoClose: 3000,
            });
          } else {
            toast.error(errorMessage, {
              toastId: `error-${studentNumber}`,
              autoClose: 2000,
            });
          }

          // 오류 시에는 더 짧은 시간 후 다시 스캔 가능
          setTimeout(() => {
            setLastScanned(null);
            setQrLocation(null);
            setIsProcessing(false); // 처리 완료 플래그 해제
          }, 500);
        }
      }
    } catch (error) {
      console.error("QR 처리 오류:", error);
      toast.error("QR 코드 처리 중 오류가 발생했습니다.", {
        toastId: "processing-error",
        autoClose: 2000,
      });

      // 오류 시에는 더 짧은 시간 후 다시 스캔 가능
      setTimeout(() => {
        setLastScanned(null);
        setQrLocation(null);
        setIsProcessing(false); // 처리 완료 플래그 해제
      }, 500);
    }
  };

  const onScanFailure = (error: any) => {
    // 스캔 실패는 로그에만 남기고, 화면에 표시하지 않음
    // console.debug("QR 코드 스캔 실패:", error);
  };

  // QR 코드 위치에 오버레이 표시를 위한 스타일 계산
  const getQROverlayStyle = () => {
    if (!qrLocation) return {};

    // 중심점 계산
    const centerX =
      (qrLocation.topLeft.x +
        qrLocation.topRight.x +
        qrLocation.bottomLeft.x +
        qrLocation.bottomRight.x) /
      4;
    const centerY =
      (qrLocation.topLeft.y +
        qrLocation.topRight.y +
        qrLocation.bottomLeft.y +
        qrLocation.bottomRight.y) /
      4;

    // 너비와 높이 계산
    const width =
      Math.max(
        Math.abs(qrLocation.topRight.x - qrLocation.topLeft.x),
        Math.abs(qrLocation.bottomRight.x - qrLocation.bottomLeft.x)
      ) + 20; // 여백 증가

    const height =
      Math.max(
        Math.abs(qrLocation.bottomLeft.y - qrLocation.topLeft.y),
        Math.abs(qrLocation.bottomRight.y - qrLocation.topRight.y)
      ) + 20; // 여백 증가

    return {
      left: `${Math.max(0, centerX - width / 2)}%`,
      top: `${Math.max(0, centerY - height / 2)}%`,
      width: `${Math.min(100, width)}%`,
      height: `${Math.min(100, height)}%`,
    };
  };

  return (
    <div className="w-full h-screen bg-gray-50 overflow-hidden">
      <div className="w-full h-full">
        {/* 메인 컨텐츠 */}
        <div className="flex flex-col lg:flex-row gap-0 h-full">
          {/* 왼쪽: QR 스캐너 */}
          <div className="flex-1 lg:flex-[3]">
            <div className="bg-white shadow-xl p-2 sm:p-4 lg:p-6 h-full">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 sm:mb-4 lg:mb-6 gap-3">
                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800">
                  카메라
                </h2>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                  {/* 교육 회차 선택 */}
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                      교육 회차:
                    </label>
                    <select
                      value={selectedSessionId}
                      onChange={(e) => setSelectedSessionId(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[130px]"
                      disabled={scanning}
                    >
                      {sessionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {scanning && (
                    <div className="flex items-center gap-2 bg-green-100 text-green-800 px-2 py-1 lg:px-3 lg:py-1 rounded-full text-xs lg:text-sm font-medium">
                      <div className="w-2 h-2 lg:w-3 lg:h-3 bg-green-500 rounded-full animate-pulse"></div>
                      스캔 중
                    </div>
                  )}
                </div>
              </div>

              {/* QR 스캐너 컨테이너 */}
              <div
                id="qr-container"
                ref={scannerRef}
                className="w-full bg-gray-900 relative overflow-hidden rounded-lg lg:rounded-xl shadow-lg"
                onTouchStart={handleCameraTouch}
                style={{
                  aspectRatio: "16/9",
                  minHeight: "200px",
                  maxHeight: "calc(100vh - 200px)",
                }}
              >
                {/* QR Reader 요소가 여기에 마운트됩니다 */}
                {!scanning && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 text-white p-4 text-center z-10">
                    <p className="text-xl">
                      {permissionError
                        ? "카메라 접근 권한이 필요합니다"
                        : "카메라가 비활성화되어 있습니다"}
                    </p>
                    {permissionError && (
                      <p className="mt-2 text-base opacity-80">
                        브라우저 주소창 왼쪽의 카메라 아이콘을 클릭하여 권한을
                        허용해주세요
                      </p>
                    )}
                  </div>
                )}

                {/* 텔레그램 스타일 스캔 가이드 */}
                {scanning && (
                  <>
                    {/* 스캔 안내 텍스트 */}
                    <div className="absolute top-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
                      <div className="bg-black bg-opacity-60 text-white px-4 py-2 rounded-full text-center">
                        QR 코드를 화면에 비춰주세요
                      </div>
                    </div>

                    {/* 터치 포커스 표시 */}
                    {focusPoint && (
                      <div
                        className="absolute w-16 h-16 border-2 border-yellow-400 rounded-full pointer-events-none z-30 animate-ping"
                        style={{
                          left: `${focusPoint.x}%`,
                          top: `${focusPoint.y}%`,
                          transform: "translate(-50%, -50%)",
                        }}
                      >
                        <div className="absolute inset-0 w-full h-full border-2 border-yellow-400 rounded-full animate-pulse"></div>
                        <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-yellow-400 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
                      </div>
                    )}

                    {/* 포커스 안내 텍스트 (모바일만) */}
                    <div className="absolute bottom-2 left-2 sm:hidden text-white text-xs bg-black bg-opacity-50 px-2 py-1 rounded pointer-events-none z-20">
                      📱 화면을 터치하여 포커스 조정
                    </div>

                    {/* 스캔 애니메이션 - 화면 모서리에 움직이는 선 */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute top-0 left-0 w-20 h-1 bg-blue-500 animate-scanline-h"></div>
                      <div className="absolute top-0 left-0 w-1 h-20 bg-blue-500 animate-scanline-v"></div>
                      <div className="absolute top-0 right-0 w-20 h-1 bg-blue-500 animate-scanline-h"></div>
                      <div className="absolute top-0 right-0 w-1 h-20 bg-blue-500 animate-scanline-v"></div>
                      <div className="absolute bottom-0 left-0 w-20 h-1 bg-blue-500 animate-scanline-h"></div>
                      <div className="absolute bottom-0 left-0 w-1 h-20 bg-blue-500 animate-scanline-v"></div>
                      <div className="absolute bottom-0 right-0 w-20 h-1 bg-blue-500 animate-scanline-h"></div>
                      <div className="absolute bottom-0 right-0 w-1 h-20 bg-blue-500 animate-scanline-v"></div>
                    </div>

                    {/* QR 코드 인식 시 하이라이트 효과 */}
                    {qrLocation && (
                      <>
                        {/* 메인 하이라이트 박스 */}
                        <div
                          className={`absolute rounded-lg pointer-events-none transition-all duration-300 z-20 ${
                            animateQR
                              ? "border-4 border-green-400 bg-green-400 bg-opacity-30 shadow-lg shadow-green-400/50 scale-105"
                              : "border-3 border-white border-dashed bg-white bg-opacity-10"
                          }`}
                          style={getQROverlayStyle()}
                        >
                          {/* 모서리 강조 효과 */}
                          <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-green-400 rounded-tl-lg"></div>
                          <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-green-400 rounded-tr-lg"></div>
                          <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-green-400 rounded-bl-lg"></div>
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-green-400 rounded-br-lg"></div>

                          {/* 중앙 체크 아이콘 (인식 성공 시) */}
                          {animateQR && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="bg-green-500 text-white rounded-full p-2 shadow-lg animate-bounce">
                                <svg
                                  className="w-6 h-6"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                  ></path>
                                </svg>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 스캔 라인 효과 */}
                        {!animateQR && (
                          <div
                            className="absolute pointer-events-none z-10"
                            style={getQROverlayStyle()}
                          >
                            <div className="absolute inset-0 overflow-hidden rounded-lg">
                              <div className="absolute w-full h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-scan-line"></div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* QR 인식 성공 시 전체 화면 효과 */}
                    {animateQR && (
                      <div className="absolute inset-0 pointer-events-none z-30">
                        {/* 전체 화면 초록색 테두리 */}
                        <div className="absolute inset-2 border-4 border-green-400 rounded-lg animate-pulse"></div>

                        {/* 중앙 성공 메시지 */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-green-500 text-white px-6 py-3 rounded-full shadow-lg animate-bounce flex items-center gap-2">
                            <svg
                              className="w-6 h-6"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              ></path>
                            </svg>
                            <span className="font-semibold">QR 코드 인식!</span>
                          </div>
                        </div>

                        {/* 모서리 효과 */}
                        <div className="absolute top-4 left-4 w-12 h-12 border-t-4 border-l-4 border-green-400 rounded-tl-lg animate-ping"></div>
                        <div className="absolute top-4 right-4 w-12 h-12 border-t-4 border-r-4 border-green-400 rounded-tr-lg animate-ping"></div>
                        <div className="absolute bottom-4 left-4 w-12 h-12 border-b-4 border-l-4 border-green-400 rounded-bl-lg animate-ping"></div>
                        <div className="absolute bottom-4 right-4 w-12 h-12 border-b-4 border-r-4 border-green-400 rounded-br-lg animate-ping"></div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 스캐너 컨트롤 */}
              <div className="mt-2 sm:mt-4 lg:mt-6 flex justify-center items-center gap-3">
                {!scanning ? (
                  <button
                    onClick={startScanner}
                    className="px-4 py-2 sm:px-6 sm:py-3 lg:px-8 lg:py-4 bg-blue-600 text-white rounded-lg lg:rounded-xl hover:bg-blue-700 font-semibold text-sm sm:text-base lg:text-lg shadow-lg transition-all duration-200 hover:scale-105 flex items-center gap-2 sm:gap-3"
                  >
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    QR 스캐너 시작
                  </button>
                ) : (
                  <>
                    <button
                      onClick={stopScanner}
                      className="px-4 py-2 sm:px-6 sm:py-3 lg:px-8 lg:py-4 bg-red-600 text-white rounded-lg lg:rounded-xl hover:bg-red-700 font-semibold text-sm sm:text-base lg:text-lg shadow-lg transition-all duration-200 hover:scale-105 flex items-center gap-2 sm:gap-3"
                    >
                      <svg
                        className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                        />
                      </svg>
                      스캐너 중지
                    </button>
                    <button
                      onClick={switchCamera}
                      className="px-3 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4 bg-purple-600 text-white rounded-lg lg:rounded-xl hover:bg-purple-700 font-semibold text-sm sm:text-base lg:text-lg shadow-lg transition-all duration-200 hover:scale-105 flex items-center gap-2"
                      title={
                        cameraFacing === "user"
                          ? "후면 카메라로 전환"
                          : "전면 카메라로 전환"
                      }
                    >
                      <svg
                        className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6"
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
                        {cameraFacing === "user" ? "후면" : "전면"}
                      </span>
                    </button>
                  </>
                )}
              </div>

              {/* 스타일 정의 */}
              <style jsx global>{`
                @keyframes scanline-h {
                  0% {
                    transform: translateX(0);
                  }
                  50% {
                    transform: translateX(calc(100vw - 5rem));
                  }
                  100% {
                    transform: translateX(0);
                  }
                }
                @keyframes scanline-v {
                  0% {
                    transform: translateY(0);
                  }
                  50% {
                    transform: translateY(calc(100vh - 5rem));
                  }
                  100% {
                    transform: translateY(0);
                  }
                }
                @keyframes scan-line {
                  0% {
                    transform: translateY(-100%);
                  }
                  100% {
                    transform: translateY(400%);
                  }
                }
                .animate-scanline-h {
                  animation: scanline-h 4s infinite ease-in-out;
                }
                .animate-scanline-v {
                  animation: scanline-v 4s infinite ease-in-out;
                }
                .animate-scan-line {
                  animation: scan-line 2s infinite ease-in-out;
                }
                /* 전면카메라일 때만 미러모드 적용 */
                #qr-reader video {
                  transform: ${cameraFacing === "user"
                    ? "scaleX(-1)"
                    : "scaleX(1)"} !important;
                }
              `}</style>

              {permissionError && (
                <div className="mt-4 sm:mt-6 lg:mt-8 p-4 sm:p-6 bg-yellow-50 border border-yellow-200 rounded-lg lg:rounded-xl shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <svg
                        className="w-6 h-6 text-yellow-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-yellow-800 mb-2">
                        카메라 권한 필요
                      </h3>
                      <p className="text-yellow-700 mb-3">
                        QR 코드 스캔을 위해서는 카메라 접근 권한이 필요합니다.
                      </p>
                      <div className="text-yellow-700 text-sm space-y-1 mb-4">
                        <p>• Chrome: 주소창 왼쪽 아이콘 클릭 → 카메라 → 허용</p>
                        <p>• Safari: 설정 → 웹사이트 → 카메라 → 허용</p>
                      </div>
                      <button
                        onClick={startScanner}
                        className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium transition-colors"
                      >
                        다시 시도
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 오른쪽: 출석 기록 */}
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 border-l border-gray-200">
            <div className="bg-white shadow-xl p-2 sm:p-4 lg:p-6 h-full">
              {/* 출석 기록 헤더 */}
              <div className="flex items-center justify-between mb-2 sm:mb-4 lg:mb-6">
                <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-800">
                  출석 기록
                </h2>
              </div>

              {/* 출석 기록 리스트 */}
              <div className="space-y-2 lg:space-y-3 max-h-[calc(100vh-150px)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                {attendanceHistory.length === 0 ? (
                  <div className="text-center py-12 sm:py-16 lg:py-20">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 mx-auto mb-4 sm:mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                      <svg
                        className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 text-gray-400"
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
                    </div>
                    <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-700 mb-2 lg:mb-3">
                      출석 기록이 없습니다
                    </h3>
                    <p className="text-sm sm:text-base text-gray-500">
                      QR 코드를 스캔하여 출석을 시작하세요
                    </p>
                  </div>
                ) : (
                  attendanceHistory.slice(0, 50).map((record, index) => (
                    <div
                      key={record.id}
                      className="group relative bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 border border-green-200 rounded-lg p-2 sm:p-3 lg:p-4 hover:shadow-lg transition-all duration-300 hover:scale-[1.02] hover:border-green-300"
                    >
                      {/* 순서 번호 */}
                      <div className="absolute -top-1 -left-1 w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-lg">
                        {index + 1}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center shadow-lg">
                            <svg
                              className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-white"
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
                          <div>
                            <h4 className="font-bold text-green-800 text-xs sm:text-sm lg:text-base">
                              출석 완료
                            </h4>
                            <p className="text-green-600 text-xs font-medium">
                              {record.timestamp}
                            </p>
                            <p className="text-green-700 text-xs font-medium bg-green-100 px-2 py-0.5 rounded mt-1 inline-block">
                              {sessionOptions.find(
                                (option) => option.value === record.sessionId
                              )?.label || record.sessionId}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="bg-gradient-to-r from-green-600 to-green-700 text-white px-2 py-1 sm:px-3 sm:py-2 lg:px-4 lg:py-2 rounded-lg font-bold text-sm sm:text-base lg:text-lg shadow-lg min-w-[40px] sm:min-w-[50px] lg:min-w-[60px] text-center">
                            {record.number}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}

                {attendanceHistory.length > 50 && (
                  <div className="text-center py-4">
                    <div className="inline-flex items-center gap-2 bg-gray-100 text-gray-600 px-4 py-2 rounded-full text-sm font-medium">
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
                          d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
                        />
                      </svg>
                      최근 50개 기록만 표시
                    </div>
                  </div>
                )}
              </div>

              {/* 기록 지우기 버튼 */}
              {attendanceHistory.length > 0 && (
                <div className="mt-2 sm:mt-4 lg:mt-6 pt-2 sm:pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setAttendanceHistory([])}
                    className="w-full px-2 py-1 sm:px-3 sm:py-2 lg:px-4 lg:py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold rounded-lg transition-all duration-200 hover:scale-105 flex items-center justify-center gap-2 shadow-lg text-xs sm:text-sm lg:text-base"
                  >
                    <svg
                      className="w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                    모든 기록 지우기
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
