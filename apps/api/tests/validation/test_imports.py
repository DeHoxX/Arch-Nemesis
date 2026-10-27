"""Tests ensuring the validation module imports only pydantic, networkx, and standard library."""

import ast
from pathlib import Path

import pytest

VALIDATION_MODULE_DIR = (
    Path(__file__).parent.parent.parent / "src" / "archnemesis" / "modules" / "validation"
)

ALLOWED_THIRD_PARTY_OR_STDLIB = frozenset(
    {
        "__future__",
        "pydantic",
        "networkx",
        # Standard library modules used
        "dataclasses",
        "typing",
        "collections",
        "heapq",
        "re",
        "json",
        "pathlib",
        "random",
        "datetime",
        "abc",
    }
)


def assert_imports_are_pure(tree: ast.AST, filename: str) -> None:
    """Verify that AST imports only reference permitted validation submodules or allowed external libraries."""
    for node in ast.walk(tree):
        module_path: str | None = None
        if isinstance(node, ast.Import):
            for alias in node.names:
                module_path = alias.name
                _verify_import(module_path, filename)
        elif isinstance(node, ast.ImportFrom) and node.module:
            module_path = node.module
            _verify_import(module_path, filename)


def _verify_import(module_path: str, filename: str) -> None:
    if module_path.startswith("archnemesis"):
        assert module_path.startswith("archnemesis.modules.validation"), (
            f"Forbidden internal import '{module_path}' in {filename}! "
            "Validation can only import from its own package 'archnemesis.modules.validation'."
        )
    else:
        top_level = module_path.split(".")[0]
        assert top_level in ALLOWED_THIRD_PARTY_OR_STDLIB, (
            f"Forbidden import '{module_path}' in {filename}! "
            f"Validation must only import from: {sorted(ALLOWED_THIRD_PARTY_OR_STDLIB)}"
        )


def test_validation_module_imports_are_pure() -> None:
    """Scan all Python AST imports in modules/validation/ to prove no unauthorized imports exist."""
    py_files = list(VALIDATION_MODULE_DIR.glob("*.py"))
    assert py_files, f"No python files found in {VALIDATION_MODULE_DIR}"

    for py_file in py_files:
        with open(py_file, encoding="utf-8") as f:
            tree = ast.parse(f.read(), filename=py_file.name)
        assert_imports_are_pure(tree, py_file.name)


def test_ast_checker_rejects_archnemesis_settings() -> None:
    """Verify that importing archnemesis.settings raises an AssertionError."""
    snippet = "from archnemesis.settings import settings\n"
    tree = ast.parse(snippet)
    with pytest.raises(AssertionError, match="archnemesis.settings"):
        assert_imports_are_pure(tree, "dummy_validation_file.py")
