export function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function(){
            var t = localStorage.getItem("theme");
            var d = t || "system";
            if (d === "dark" || (d === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
              document.documentElement.classList.add("dark");
            }
          })();
        `,
      }}
    />
  );
}
