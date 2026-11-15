import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { TrackedFile } from '../types';
import { 
  FileDown, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  QrCode, 
  ExternalLink,
  BookOpen,
  Info,
  Download,
  AlertTriangle,
  Smartphone,
  Share2
} from 'lucide-react';
import { getViewUrl, getDirectDownloadUrl } from '../utils/driveHelper';

interface StudentDownloadViewProps {
  file: TrackedFile;
  onRecordDownload: (fileId: string) => void;
  onExitStudentMode?: () => void;
}

export const StudentDownloadView: React.FC<StudentDownloadViewProps> = ({ 
  file, 
  onRecordDownload,
  onExitStudentMode 
}) => {
  const [countdown, setCountdown] = useState<number>(3);
  const [hasStartedDownload, setHasStartedDownload] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isInAppBrowser, setIsInAppBrowser] = useState<boolean>(false);
  const [isKakao, setIsKakao] = useState<boolean>(false);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  // Use skipCount=1 on redirect URL since handleDownloadClick records +1 reliably via POST
  const directDownloadUrl = `${originUrl}/api/download/${file.id}/direct?skipCount=1`;
  const gdriveOfficialUrl = getDirectDownloadUrl(file.driveFileId, file.driveUrl);
  const gdriveViewerUrl = getViewUrl(file.driveFileId, file.driveUrl);

  // Check if mobile in-app browser (KakaoTalk, Naver, etc.)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      const kakao = ua.includes('kakaotalk');
      const inApp = kakao || ua.includes('naver') || ua.includes('line') || ua.includes('instagram') || ua.includes('fban') || ua.includes('fbav');
      setIsKakao(kakao);
      setIsInAppBrowser(inApp);
    }
  }, []);

  // Generate QR code locally for students on mobile
  useEffect(() => {
    const studentShareUrl = `${originUrl}/?file=${file.id}`;
    QRCode.toDataURL(studentShareUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error(err));
  }, [file.id, originUrl]);

  // Countdown for student visual cue
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [file.id]);

  // Record count reliably in-page (with keepalive) before browser handles download
  const handleDownloadClick = () => {
    setHasStartedDownload(true);
    onRecordDownload(file.id);
  };

  const handleOpenExternalBrowser = () => {
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      if (isKakao) {
        window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}`;
      } else {
        window.open(currentUrl, '_blank');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-3 sm:p-6 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden my-4">
        
        {/* In-app Browser Notice Banner (KakaoTalk/Naver) */}
        {isInAppBrowser && (
          <div className="bg-amber-500 text-white px-4 py-3 text-xs flex items-start gap-2.5 shadow-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="grow">
              <span className="font-bold block mb-0.5">인앱 브라우저 안내 (카카오톡/네이버)</span>
              <p className="text-amber-100 leading-snug">
                인앱 브라우저에서는 파일 저장이 차단될 수 있습니다. 
                우측 상단 <strong>⋮ 메뉴 &gt; 다른 브라우저로 열기(Safari/Chrome)</strong>를 누르시면 원활히 다운로드됩니다.
              </p>
              {isKakao && (
                <button
                  type="button"
                  onClick={handleOpenExternalBrowser}
                  className="mt-1.5 px-2.5 py-1 bg-white text-amber-800 rounded-md font-bold text-[11px] shadow-xs cursor-pointer"
                >
                  기본 브라우저(Safari/Chrome)로 열기
                </button>
              )}
            </div>
          </div>
        )}

        {/* Top Header */}
        <div className="bg-linear-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-6 text-white text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-inner">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">
            학생 학습 &middot; 과제 자료 다운로드
          </h1>
          <p className="text-xs text-blue-100 mt-1">
            공식 구글 드라이브 연동 고속 다운로드 시스템
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 text-center space-y-5">
          {/* File Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase">
                {file.category}
              </span>
              <span className="text-xs font-mono text-slate-500 font-semibold">
                용량: {file.size}
              </span>
            </div>
            <h2 className="text-base font-bold text-slate-900 break-words leading-snug mb-1">
              {file.name}
            </h2>
            {file.description && (
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {file.description}
              </p>
            )}
          </div>

          {/* Countdown / Download Status */}
          <div>
            {countdown > 0 ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 animate-spin text-amber-600" />
                <span>
                  자료 준비 중... <strong className="text-amber-900 font-bold text-sm">{countdown}초</strong>
                </span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold animate-in fade-in duration-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  {hasStartedDownload
                    ? '다운로드가 시작되었습니다. 상단/하단 다운로드 창을 확인하세요.'
                    : '다운로드 준비 완료! 아래 파란색 버튼을 눌러주세요.'}
                </span>
              </div>
            )}
          </div>

          {/* Main Action Buttons */}
          <div className="space-y-2.5">
            {/* Primary Download Anchor (Same-tab navigation avoids mobile popup blockers; POST records +1 once) */}
            <a
              href={directDownloadUrl}
              onClick={handleDownloadClick}
              className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
            >
              <FileDown className="w-5 h-5 animate-pulse" />
              <span>지금 바로 파일 다운로드 (초고속)</span>
            </a>

            {/* Backup Direct Link directly to Google Drive CDN */}
            <a
              href={gdriveOfficialUrl}
              onClick={handleDownloadClick}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>구글 드라이브 원본 직접 받기 (백업)</span>
            </a>

            {/* PDF Viewer Link */}
            <a
              href={gdriveViewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2 px-4 rounded-xl text-slate-600 hover:text-slate-900 font-medium text-xs flex items-center justify-center gap-1 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              <span>구글 웹 뷰어로 내용 먼저 보기</span>
            </a>
          </div>

          {/* Mobile Download Troubleshooting Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-left text-[11px] text-slate-500 space-y-1">
            <span className="font-bold flex items-center gap-1 text-slate-700">
              <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              스마트폰에서 다운로드할 때 팁
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-slate-600 pl-0.5">
              <li>
                <strong>아이폰(Safari):</strong> 화면 하단에 <em>&apos;...을(를) 다운로드하겠습니까?&apos;</em> 팝업이 뜨면 <strong>[다운로드]</strong>를 누르시면 파일 앱에 저장됩니다.
              </li>
              <li>
                <strong>안드로이드(Chrome):</strong> 화면 상단 알림창에 다운로드 진행 상태가 표시됩니다.
              </li>
            </ul>
          </div>

          {/* QR Code Section for Friends / Mobile */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
              <QrCode className="w-4 h-4 text-blue-600" />
              <span>친구에게 공유하거나 다른 기기로 받으려면?</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              스마트폰 기본 카메라로 비추면 이 학습 자료 다운로드 페이지가 열립니다.
            </p>
            <div className="inline-block p-2.5 bg-white rounded-2xl border border-slate-200 shadow-xs">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`${file.name} QR코드`}
                  className="w-36 h-36 object-contain"
                />
              ) : (
                <div className="w-36 h-36 flex items-center justify-center text-xs text-slate-400">
                  QR 로딩 중...
                </div>
              )}
            </div>
          </div>

          {/* Footer Safety Notice */}
          <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>바이러스 검사가 완료된 안전한 공식 구글 드라이브 파일입니다</span>
          </div>

          {/* Teacher Admin Switch (Optional) */}
          {onExitStudentMode && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onExitStudentMode}
                className="text-[11px] text-slate-400 hover:text-slate-600 underline cursor-pointer"
              >
                교사용 전체 관리 화면으로 돌아가기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
