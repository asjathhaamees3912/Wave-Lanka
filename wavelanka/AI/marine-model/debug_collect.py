#!/usr/bin/env python3
from pathlib import Path
import sys
sys.path.insert(0, str(Path.cwd()))
from collect_forecast_data import date_range, collect_zone, ZONES, build_feature_rows

start_date, end_date = date_range(180)
frames = []
for zone in ZONES:
    df = collect_zone(zone, start_date, end_date)
    print(zone['id'], 'rows', len(df))
    frames.append(df)

full = frames[0].append(frames[1:]).reset_index(drop=True) if len(frames) > 1 else frames[0]
print('concat rows', len(full))
full2 = build_feature_rows(full)
print('after build rows', len(full2))
print('na counts all columns (first 30):')
print(full2.isna().sum().sort_values().head(30))
for target in ['safety_6h', 'safety_12h', 'safety_24h']:
    print(target, 'value counts')
    print(full2[target].value_counts(dropna=False))
print('sample rows with any NaN in required cols:')
req = [
    'wave_height_t0','wave_period_t0','swell_wave_height_t0','swell_wave_period_t0',
    'wind_wave_height_t0','wind_speed_t0','wind_gusts_t0','sea_surface_temperature_t0',
    'weather_code_t0','month','hour','zone_id','wave_height_t-3h','wave_height_t-6h',
    'wind_speed_t-3h','wind_speed_t-6h','wave_delta_3h','wave_delta_6h','wind_delta_3h',
    'swell_trend','wave_wind_ratio','swell_steepness','wave_energy','monsoon_flag',
    'safety_6h','safety_12h','safety_24h'
]
print(full2[req].iloc[:20].to_string())
