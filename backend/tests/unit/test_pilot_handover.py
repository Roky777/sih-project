import pytest

from fleet_maintenance.verification.pilot_handover import check_handover

CONTRACT = {
    "schema_version": "test-v1",
    "data_contract": {"unit_conversion_version": None},
    "evaluation": {"phase": "not_started"},
    "acceptance": {"decision": "pending"},
}


def test_omitted_sections_cannot_pass_as_an_empty_complete_handover() -> None:
    report = check_handover({"schema_version": "test-v1"}, CONTRACT)
    assert "data_contract.unit_conversion_version" in report["missing_fields"]
    assert not report["handover_complete"]


def test_null_sections_do_not_crash_or_qualify() -> None:
    report = check_handover({"schema_version": "test-v1", "acceptance": None}, CONTRACT)
    assert "acceptance" in report["missing_fields"]
    assert not report["operational_qualification_established_by_this_check"]


def test_complete_references_are_not_authenticity_or_qualification_evidence() -> None:
    report = check_handover({
        "schema_version": "test-v1",
        "data_contract": {"unit_conversion_version": "operator-reference"},
        "evaluation": {"phase": "reviewed"},
        "acceptance": {"decision": "restrict"},
    }, CONTRACT)
    assert report["handover_complete"]
    assert not report["operational_qualification_established_by_this_check"]


def test_wrong_schema_is_rejected() -> None:
    with pytest.raises(ValueError, match="Unsupported"):
        check_handover({}, CONTRACT)


@pytest.mark.parametrize("empty", [{}, [], "   "])
def test_empty_placeholders_do_not_count_as_evidence(empty: object) -> None:
    report = check_handover({
        "schema_version": "test-v1",
        "data_contract": {"unit_conversion_version": empty},
        "evaluation": {"phase": "reviewed"},
        "acceptance": {"decision": "accept"},
    }, CONTRACT)
    assert "data_contract.unit_conversion_version" in report["missing_fields"]
    assert not report["handover_complete"]
