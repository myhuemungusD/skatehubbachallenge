"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFirebaseAuth } from "@/lib/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { callFunction } from "@/lib/firebase/functionsClient";
import { useToast } from "@/store/toastStore";

export const HomeView = () => {
  const router = useRouter();
  const { user, handle, loading, signInWithGoogle, ensureAnonymous, logout } = useFirebaseAuth();
  const [handleInput, setHandleInput] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    ensureAnonymous();
  }, [ensureAnonymous]);

  useEffect(() => {
    if (handle) {
      setHandleInput(handle);
    }
  }, [handle]);

  const submitHandle = async () => {
    if (!handleInput.trim()) {
      toast({ title: "Handle required", description: "Choose a handle before jumping into games." });
      return;
    }
    try {
      await callFunction("setHandle", { handle: handleInput.trim() });
      toast({ title: "Handle locked", description: `See you in the plaza, ${handleInput.trim()}!` });
    } catch (error) {
      toast({
        title: "Handle issue",
        description: error instanceof Error ? error.message : "Could not save handle.",
        variant: "destructive"
      });
    }
  };

  const createGame = async () => {
    try {
      setCreating(true);
      const { code } = await callFunction<{ code: string }>("createGame", {});
      toast({ title: "Lobby ready", description: `Share code ${code}` });
      router.push(`/game/${code}`);
    } catch (error) {
      toast({
        title: "Create failed",
        description: error instanceof Error ? error.message : "Unable to create game",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  const joinGame = async () => {
    if (!joinCode.trim()) {
      toast({ title: "Enter a code", description: "Ask your friend to send the lobby code." });
      return;
    }
    try {
      setJoining(true);
      await callFunction("joinGame", { code: joinCode.trim().toUpperCase() });
      router.push(`/game/${joinCode.trim().toUpperCase()}`);
    } catch (error) {
      toast({
        title: "Join failed",
        description: error instanceof Error ? error.message : "Could not join game",
        variant: "destructive"
      });
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-slate-400">Loading profile…</div>;
  }

  return (
    <main className="flex flex-1 flex-col gap-8">
      <section className="rounded-[40px] border border-hubba-green/20 bg-gradient-to-br from-hubba-black via-black to-hubba-black px-6 py-10 shadow-2xl">
        <div className="flex flex-col gap-6 text-white">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            SkateHubba <span className="text-hubba-green">Live S.K.8</span>
          </h1>
          <p className="max-w-2xl text-lg text-slate-300">
            Spin up a battle in seconds. Record live clips, keep the letters honest, and crown the plaza king.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={createGame} disabled={!handle || creating} size="lg">
              Create lobby
            </Button>
            <Button onClick={signInWithGoogle} variant="ghost" size="lg">
              Upgrade with Google
            </Button>
            {user ? (
              <Button onClick={logout} variant="outline" size="lg">
                Sign out
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Secure your handle</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Label htmlFor="handle">Handle</Label>
            <Input
              id="handle"
              value={handleInput}
              onChange={(event) => setHandleInput(event.target.value)}
              placeholder="heelflip-wizard"
              aria-describedby="handle-help"
            />
            <p id="handle-help" className="text-xs text-slate-400">
              Handles are unique. This is how skaters find you.
            </p>
            <Button onClick={submitHandle} disabled={handleInput.trim() === handle}>
              Save handle
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Join a battle</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Label htmlFor="code">Lobby code</Label>
            <Input
              id="code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="ABCD"
              maxLength={6}
            />
            <Button onClick={joinGame} disabled={!handle || joining}>
              Join lobby
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 sm:grid-cols-3">
        <Feature title="Realtime integrity" description="Server refs verify every letter and lock the state." />
        <Feature title="One-take uploads" description="MediaRecorder pipes straight to Firebase Storage with resumable uploads." />
        <Feature title="Global-ready" description="PWA install, offline shell, and mobile-first controls." />
      </section>
    </main>
  );
};

const Feature = ({ title, description }: { title: string; description: string }) => (
  <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/40 p-4">
    <h3 className="text-lg font-semibold text-white">{title}</h3>
    <p className="text-sm text-slate-400">{description}</p>
  </div>
);
