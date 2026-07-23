export default function BrandLogo({ className = "" }) {
  return (
    <img
      src="/logo-v2.png"
      alt="Wave Lanka Logo"
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}
