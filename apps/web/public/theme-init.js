(function () {
  try {
    var stored = localStorage.getItem("arch-theme");
    if (stored === "light") {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    }
  } catch {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  }
})();
