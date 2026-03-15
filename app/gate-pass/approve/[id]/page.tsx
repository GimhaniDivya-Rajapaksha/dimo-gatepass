"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Redirect old /gate-pass/approve/[id] URLs to the unified detail page */
export default function ApproveRedirect() {
  const params = useParams();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/gate-pass/${params.id as string}`);
  }, [params.id, router]);
  return null;
}
