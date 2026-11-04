import unittest
from unittest.mock import MagicMock, patch

import requests

from transport.backend_client import BackendClient


class BackendClientTests(unittest.TestCase):
    def test_client_init_headers(self):
        client = BackendClient(
            base_url="http://localhost:5000",
            api_token="secure_token_abc",
        )
        self.assertEqual(client.base_url, "http://localhost:5000")
        self.assertEqual(
            client.session.headers["Authorization"],
            "Bearer secure_token_abc",
        )
        client.close()

    def test_check_health_success(self):
        client = BackendClient(
            base_url="http://localhost:5000",
            api_token="token123",
        )

        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch.object(client.session, "get", return_value=mock_resp):
            health = client.check_health()
            self.assertTrue(health["reachable"])
            self.assertEqual(health["status_code"], 200)

        client.close()

    def test_send_event_success(self):
        client = BackendClient(
            base_url="http://localhost:5000",
            api_token="token123",
        )

        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_resp.content = b'{"success": true, "accepted": true}'
        mock_resp.json.return_value = {"success": True, "accepted": True}

        with patch.object(client.session, "post", return_value=mock_resp):
            res = client.send_event({"event_type": "crowd_overcrowding", "camera_id": "cam-1"})
            self.assertTrue(res["accepted"])

        client.close()

    def test_send_event_retry_exhaustion_raises(self):
        client = BackendClient(
            base_url="http://localhost:5000",
            api_token="token123",
            max_retries=2,
            timeout=1.0,
        )

        with patch.object(
            client.session,
            "post",
            side_effect=requests.RequestException("Network unreachable"),
        ):
            with self.assertRaises(RuntimeError) as ctx:
                client.send_event({"event_type": "crowd_overcrowding"})
            self.assertIn("Could not deliver AI event", str(ctx.exception))

        client.close()


if __name__ == "__main__":
    unittest.main()
