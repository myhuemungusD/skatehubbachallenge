"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/store/toastStore";

interface Props {
  onVideoFinalized: (blob: Blob) => Promise<void>;
  disabled?: boolean;
  allowSelfFail?: boolean;
  onSelfFail?: () => Promise<void>;
}

export const VideoRecorder = ({ onVideoFinalized, disabled, allowSelfFail, onSelfFail }: Props) => {
  const [isRecording, setIsRecording] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof MediaRecorder === "undefined") {
      toast({
        title: "Recording unsupported",
        description: "Your browser does not support in-app recording yet.",
        variant: "destructive"
      });
    }
  }, [toast]);

  useEffect(() => {
    return () => {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const stopStream = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined") {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play();
      }
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm"
      });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setIsRecording(false);
        stopStream();
        await onVideoFinalized(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (error) {
      toast({
        title: "Camera access denied",
        description: "Allow camera and microphone to record your clip.",
        variant: "destructive"
      });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/80">
        <video ref={videoRef} className="h-64 w-full bg-black object-cover" playsInline controls={!!previewUrl} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {!isRecording ? (
          <Button onClick={startRecording} disabled={disabled} className="flex-1">
            Record
          </Button>
        ) : (
          <Button onClick={stopRecording} variant="ghost" className="flex-1">
            Stop &amp; Upload
          </Button>
        )}
        {allowSelfFail ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled || isRecording}
            onClick={() => {
              onSelfFail?.();
            }}
            className="flex-1 border-red-500/60 text-red-300 hover:border-red-400 hover:text-red-200"
          >
            Self Fail
          </Button>
        ) : null}
      </div>
    </div>
  );
};
