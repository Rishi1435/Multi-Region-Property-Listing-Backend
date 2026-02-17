-- Generate 1000 synthetic rows for EU region
INSERT INTO properties (id, price, bedrooms, bathrooms, region_origin)
SELECT 
    i + 1000, 
    (random() * 900000 + 100000)::DECIMAL(10,2), 
    floor(random() * 5 + 1)::INT, 
    floor(random() * 3 + 1)::INT, 
    'eu'
FROM generate_series(1, 1000) AS s(i);
