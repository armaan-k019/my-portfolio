"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function WeaveLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("demo_access");
    if (token !== "weave") {
      router.replace("/demos");
    } else {
      setAuthorized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authorized) return null;
  return <>{children}</>;
}
