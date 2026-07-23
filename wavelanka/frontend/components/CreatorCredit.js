import { useRouter } from "next/router";

export default function CreatorCredit() {
  const router = useRouter();
  const isSplash = router.pathname === "/";

  if (!isSplash) return null;

  return (
    <p className="creator-credit creator-credit--splash">
      Concept &amp; Creation — Asjath Haamees
    </p>
  );
}
