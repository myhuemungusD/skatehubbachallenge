import { uploadBytesResumable, ref, getDownloadURL } from "firebase/storage";
import { firebaseStorage } from "@/lib/firebase/client";

export const uploadGameVideo = async (
  gameId: string,
  phase: string,
  slot: string,
  blob: Blob
) => {
  const storage = firebaseStorage();
  const path = `videos/${gameId}/${Date.now()}-${slot}-${phase}.webm`;
  const storageRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(storageRef, blob, {
    contentType: "video/webm"
  });

  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      undefined,
      (error) => reject(error),
      () => resolve()
    );
  });

  const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
  return { path, url: downloadUrl };
};
