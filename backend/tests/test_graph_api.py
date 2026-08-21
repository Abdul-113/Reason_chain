import sys
import os

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.services.graph_service import GraphService

def test_graph_service_output():
    res = GraphService.get_full_graph()
    assert "nodes" in res
    assert "edges" in res
    assert isinstance(res["nodes"], list)
    assert isinstance(res["edges"], list)
    assert len(res["nodes"]) > 0
    assert len(res["edges"]) > 0

    sample_node = res["nodes"][0]
    assert "id" in sample_node
    assert "label" in sample_node
    assert "type" in sample_node
    assert "properties" in sample_node

    sample_edge = res["edges"][0]
    assert "id" in sample_edge
    assert "source" in sample_edge
    assert "target" in sample_edge
    assert "label" in sample_edge
    assert "properties" in sample_edge

    print(f"[TEST PASS] GET /api/graph returned {len(res['nodes'])} nodes and {len(res['edges'])} edges.")
    print("Sample node:", sample_node)
    print("Sample edge:", sample_edge)

if __name__ == "__main__":
    test_graph_service_output()
