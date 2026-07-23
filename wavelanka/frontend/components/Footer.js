export default function Footer() {
  return (
    <footer
      className="site-footer"
      style={{
        width: "100%",
        textAlign: "center",
        padding: "20px 16px 16px",
        fontFamily: "Inter, sans-serif",
        fontSize: "0.80rem",
        fontWeight: 400,
        color: "rgba(240, 248, 255, 0.35)",
        letterSpacing: "0.3px",
        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
        marginTop: "32px",
      }}
    >
      <div>
        <span>Concept &amp; Creation - </span>
        <span
          className="site-footer__name"
          style={{ color: "rgba(137, 207, 240, 0.6)", fontWeight: 500 }}
        >
          Asjath Haamees
        </span>
      </div>
      <div style={{ marginTop: "6px" }}>
        <span>Wave Lanka © 2026</span>
      </div>
    </footer>
  );
}
