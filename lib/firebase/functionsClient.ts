import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./client";

type CallableName =
  | "createGame"
  | "joinGame"
  | "submitSetClip"
  | "judgeSet"
  | "submitRespClip"
  | "judgeResp"
  | "selfFailSet"
  | "selfFailResp"
  | "setHandle";

export const callFunction = async <TData = unknown, TParams = Record<string, unknown>>(
  name: CallableName,
  params?: TParams
): Promise<TData> => {
  const functions = firebaseFunctions();
  const callable = httpsCallable<TParams, TData>(functions, name);
  const response = await callable(params ?? ({} as TParams));
  return response.data;
};
