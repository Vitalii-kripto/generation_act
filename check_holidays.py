from datetime import datetime
import holidays
ru_holidays = holidays.RU(years=[2026])
for date, name in sorted(ru_holidays.items()):
    print(f"{date}: {name}")
