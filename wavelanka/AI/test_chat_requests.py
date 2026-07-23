import requests

ENDPOINT = 'http://localhost:8000/chat'

for msg in [
    {'message': 'Hi', 'session_id': 'sess_test'},
    {'message': 'Is it safe near Galle today?', 'session_id': 'sess_test2'},
]:
    try:
        r = requests.post(ENDPOINT, json=msg, timeout=15)
        print('REQ:', msg)
        print('STATUS:', r.status_code)
        print('BODY:', r.text)
    except Exception as e:
        print('REQ FAILED:', msg, 'ERROR:', str(e))
