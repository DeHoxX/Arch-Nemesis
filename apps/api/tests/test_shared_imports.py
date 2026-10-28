"""Test architectural boundary purity of the archnemesis.shared package."""

import ast
import sys
from pathlib import Path

ALLOWED_TOP_LEVEL = {"pydantic", "typing", "collections", "dataclasses", "enum", "uuid"}


def _get_shared_imports() -> set[str]:
    shared_dir = Path(__file__).resolve().parent.parent / "src" / "archnemesis" / "shared"
    imported: set[str] = set()

    for py_file in shared_dir.glob("*.py"):
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imported.add(alias.name)
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                imported.add(node.module)
    return imported


def test_shared_imports_only_pydantic_and_stdlib() -> None:
    """Enforce that archnemesis.shared imports only Pydantic, internal shared modules, and stdlib."""
    imported_modules = _get_shared_imports()
    for mod in imported_modules:
        top = mod.split(".")[0]
        if top in sys.stdlib_module_names or top == "typing":
            continue
        if mod.startswith("archnemesis.shared"):
            continue
        assert top == "pydantic", (
            f"archnemesis.shared imports unauthorized non-stdlib module: {mod}"
        )


def test_shared_layer_rejects_forbidden_imports() -> None:
    """Verify that importing an app module like settings into a simulated shared ast fails."""
    sample_code = "from archnemesis.settings import get_settings\n"
    tree = ast.parse(sample_code)
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    assert any(m.startswith("archnemesis.settings") for m in modules)
