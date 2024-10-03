import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// adjectives
export const adjectives_quantitative = [...new Set(['Abundant', 'Couple', 'Double', 'Each', 'Either', 'Empty', 'Enough', 'Every', 'Few', 'Full', 'Great', 'Half', 'Heavily', 'Heavy', 'Huge', 'Hundred', 'Hundreds', 'Insufficient', 'Light', 'Little', 'Many', 'Most', 'Much', 'Neither ', 'No', 'Numerous', 'Several', 'Significant', 'Single', 'Some', 'Sparse', 'Substantial', 'Sufficient', 'Too', 'Whole'])];
export const adjectives_size = [...new Set(['Beefy', 'Big', 'Bony', 'Boundless', 'Brawny', 'Broad', 'Bulky', 'Chunky', 'Colossal', 'Compact', 'Cosmic', 'Cubby', 'Curvy', 'Elfin', 'Emaciated', 'Endless', 'Enormous', 'Epic', 'Expansive', 'Extensive', 'Fat', 'Fleshy', 'Full-Size', 'Gargantuan', 'Gaunt', 'Giant', 'Gigantic', 'Grand', 'Great', 'Heavy', 'Hefty', 'Huge', 'Hulking', 'Illimitable', 'Immeasurable', 'Immense', 'Infinitesimal', 'Lanky', 'Large', 'Lean', 'Life-Size', 'Limitless', 'Little', 'Mammoth', 'Massive', 'Meager', 'Measly', 'Microscopic', 'Mini', 'Miniature', 'Minuscule', 'Minute', 'Narrow', 'Obese', 'Outsized', 'Oversize', 'Overweight', 'Paltry', 'Petite', 'Pint-Size', 'Plump', 'Pocket-Size', 'Portly', 'Pudgy', 'Puny', 'Rotund', 'Scanty', 'Scraggy', 'Scrawny', 'Short', 'Sizable', 'Skeletal', 'Skimpy', 'Skinny', 'Slender', 'Slim', 'Small', 'Squat', 'Stocky', 'Stout', 'Strapping', 'Sturdy', 'Tall', 'Teensy', 'Teeny', 'Thick', 'Thickset', 'Thin', 'Tiny', 'Titanic', 'Towering', 'Trifling', 'Trim', 'Tubby', 'Undersized', 'Underweight', 'Unlimited', 'Vast', 'Wee', 'Wide'])];
export const adjectives_age = [...new Set(['Adolescent', 'Adult', 'Aged', 'Ageless', 'Ancient', 'Antediluvian', 'Baby', 'Bygone', 'Callow', 'Centenarian', 'Creaky', 'Doddery', 'Dotard', 'Elderly', 'Fledgling', 'Fresh', 'Grizzled', 'Inceptive', 'Juvenile', 'Mature', 'Middle-aged', 'Mossy', 'Nascent', 'Neotenous', 'Old-fashioned', 'Preteen', 'Prime', 'Pubescent', 'Puerile', 'Ripened', 'Rusty', 'Sage', 'Seasoned', 'Senescent', 'Senior', 'Senior citizen', 'Spring chicken', 'Strapping', 'Teenager', 'Tender', 'Twilight', 'Venerable', 'Versed', 'Veteran', 'Vintage', 'Youthful'])];
export const adjectives_shape = [...new Set(['Aerodynamic', 'Amorphous', 'Athletic', 'Balanced', 'Bold', 'Circular', 'Conical', 'Curvaceous', 'Curvilinear', 'Cylindrical', 'Dynamic', 'Elegant', 'Elliptical', 'Flawless', 'Fluid', 'Geometric', 'Geometric', 'Graceful', 'Harmonious', 'Impeccable', 'Irregular', 'Organic', 'Organized', 'Perfect', 'Polished', 'Precise', 'Prismatic', 'Proportional', 'Pyramid', 'Rectangular', 'Rectilinear', 'Refined', 'Rounded', 'Sculpted', 'Serpentine', 'Shapely', 'Sleek', 'Smooth', 'Spherical', 'Spiraling', 'Square', 'Streamlined', 'Striking', 'Symmetrical', 'Tapered', 'Triangular'])];
export const adjectives_color = [...new Set(['Amber', 'Aqua', 'Auburn', 'Beige', 'Black', 'Blue', 'Brown', 'Burgundy', 'Cerise', 'Chartreuse', 'Chocolate', 'Coconut', 'Coral', 'Crimson', 'Emerald', 'Gold', 'Green', 'Grey', 'Lime', 'Mango', 'Maroon', 'Mauve', 'Mulberry', 'Orange', 'Pearl', 'Periwinkle', 'Pineapple', 'Pink', 'Purple', 'Red', 'Ruby', 'Silver', 'Snow', 'Taupe', 'Toffee', 'Tomato', 'Turquoise', 'Ultramarine', 'Umber', 'Verdigris', 'Vermilion', 'Violet', 'Wheat', 'White', 'Wisteria', 'Yellow'])];
export const adjectives_proper = [...new Set(['African', 'Alaskan', 'Alpine', 'Amazonian', 'America', 'Antarctic', 'Asian', 'Balinese', 'Barcelonian', 'Brazilian', 'British', 'Canadian', 'Chinese', 'Dutch', 'East', 'Freudian', 'Hawaiian', 'Himalayan', 'Iranian', 'Laotian', 'Machiavellian', 'Madagascan', 'Mexican', 'Muscovite', 'North', 'Orwellian', 'Parisian', 'Philippines', 'Polynesian', 'Rica', 'Romanesque', 'Shakespearean', 'South', 'Tibetan', 'Torontonian', 'Uzbek', 'Viennese', 'West'])];
export const adjectives_material = [...new Set(['Alloy', 'Aluminium', 'Artificial', 'Brass', 'Brick', 'Bronze', 'Cardboard', 'Cement', 'Chalk', 'Clay', 'Cloth', 'Concrete', 'Copper', 'Cotton', 'Glass', 'Gold', 'Iron', 'Lace', 'Lead', 'Leather', 'Linen', 'Magnesium', 'Marble', 'Mercury', 'Metal', 'Nickel', 'Nylon', 'Paper', 'Plastic', 'Platinum', 'Polyester', 'Rubber', 'Sand', 'Silk', 'Silver', 'Slate', 'Steel', 'Stone', 'Synthetic', 'Tin', 'Transparent', 'Uranium', 'Wood', 'Wooden', 'Wool', 'Zinc'])];
export const adjectives_purpose = [...new Set(['Adaptive', 'Aligned', 'Aligned', 'All-inclusive', 'Clear', 'Clear', 'Comprehensive', 'Comprehensive', 'Determined', 'Determined', 'Diverse', 'Empowering', 'Empowering', 'Empty', 'Filled', 'Flexible', 'Fulfilling', 'Fulfilling', 'Futile', 'Goal-oriented', 'Goal-oriented', 'Guiding', 'Guiding', 'Idle', 'Impactful', 'Impactful', 'Insignificant', 'Inspiring', 'Inspiring', 'Intentional', 'Intentional', 'Meaningful', 'Meaningful', 'Motivating', 'Motivating', 'Multifunctional', 'Pointless', 'Pragmatic', 'Profound', 'Profound', 'Purpose-driven', 'Purpose-filled', 'Purposeful', 'Purposeful', 'Purposeful', 'Resourceful', 'Resourceful', 'Satisfying', 'Satisfying', 'Significant', 'Significant', 'Transcendent', 'Transcendent', 'Useful', 'Vacant', 'Versatile'])];
export const adjectives = [
    adjectives_quantitative,
    adjectives_size,
    adjectives_age,
    adjectives_shape,
    adjectives_color,
    adjectives_proper,
    adjectives_material,
    adjectives_purpose,
];
export const noun = [...new Set(['Ability', 'Access', 'Account', 'Action', 'Active', 'Activity', 'Actor', 'Address', 'Administration', 'Advance', 'Advantage', 'Advertising', 'Advice', 'Affair', 'Affect', 'Afternoon', 'Agency', 'Agent', 'Agreement', 'Alarm', 'Alternative', 'Ambition', 'Amount', 'Analysis', 'Analyst', 'Anger', 'Angle', 'Animal', 'Annual', 'Answer', 'Anxiety', 'Anybody', 'Anything', 'Apartment', 'Appeal', 'Appearance', 'Application', 'Appointment', 'Argument', 'Arrival', 'Article', 'Aside', 'Aspect', 'Assignment', 'Assist', 'Assistance', 'Assistant', 'Associate', 'Association', 'Assumption', 'Atmosphere', 'Attack', 'Attempt', 'Attention', 'Attitude', 'Audience', 'Author', 'Average', 'Award', 'Awareness', 'Background', 'Balance', 'Baseball', 'Basis', 'Basket', 'Bathroom', 'Battle', 'Beach', 'Beautiful', 'Bedroom', 'Beginning', 'Being', 'Bench', 'Benefit', 'Beyond', 'Bicycle', 'Birth', 'Birthday', 'Bitter', 'Blame', 'Block', 'Blood', 'Board', 'Bonus', 'Border', 'Bother', 'Bottle', 'Bottom', 'Brain', 'Branch', 'Brave', 'Bread', 'Break', 'Breakfast', 'Breast', 'Breath', 'Brick', 'Bridge', 'Brief', 'Brilliant', 'Broad', 'Brother', 'Brown', 'Brush', 'Buddy', 'Budget', 'Building', 'Bunch', 'Business', 'Button', 'Buyer', 'Cabinet', 'Cable', 'Calendar', 'Camera', 'Campaign', 'Candidate', 'Candle', 'Candy', 'Capital', 'Career', 'Carpet', 'Carry', 'Catch', 'Category', 'Cause', 'Celebration', 'Chain', 'Chair', 'Challenge', 'Champion', 'Championship', 'Chance', 'Change', 'Channel', 'Chapter', 'Character', 'Charge', 'Charity', 'Chart', 'Check', 'Cheek', 'Chemical', 'Chemistry', 'Chest', 'Chicken', 'Child', 'Childhood', 'Chocolate', 'Choice', 'Church', 'Claim', 'Class', 'Classic', 'Classroom', 'Clerk', 'Click', 'Client', 'Climate', 'Clock', 'Closet', 'Clothes', 'Cloud', 'Coach', 'Coast', 'Coffee', 'Collar', 'Collection', 'College', 'Combination', 'Combine', 'Comfort', 'Comfortable', 'Command', 'Comment', 'Commercial', 'Commission', 'Committee', 'Common', 'Communication', 'Community', 'Company', 'Comparison', 'Competition', 'Complaint', 'Complex', 'Computer', 'Concentrate', 'Concept', 'Concern', 'Concert', 'Conclusion', 'Condition', 'Conference', 'Confidence', 'Conflict', 'Confusion', 'Connection', 'Consequence', 'Consideration', 'Consist', 'Constant', 'Construction', 'Contact', 'Contest', 'Context', 'Contract', 'Contribution', 'Control', 'Conversation', 'Convert', 'Cookie', 'Corner', 'Count', 'Counter', 'Country', 'County', 'Couple', 'Courage', 'Course', 'Court', 'Cousin', 'Cover', 'Crack', 'Craft', 'Crash', 'Crazy', 'Cream', 'Creative', 'Credit', 'Criticism', 'Cross', 'Culture', 'Currency', 'Current', 'Curve', 'Customer', 'Cycle', 'Damage', 'Dance', 'Database', 'Daughter', 'Dealer', 'Death', 'Debate', 'Decision', 'Definition', 'Degree', 'Delay', 'Delivery', 'Demand', 'Department', 'Departure', 'Dependent', 'Deposit', 'Depression', 'Depth', 'Description', 'Design', 'Designer', 'Desire', 'Detail', 'Development', 'Device', 'Diamond', 'Difference', 'Difficulty', 'Dimension', 'Dinner', 'Direction', 'Director', 'Disaster', 'Discipline', 'Discount', 'Discussion', 'Disease', 'Display', 'Distance', 'Distribution', 'District', 'Divide', 'Doctor', 'Document', 'Double', 'Doubt', 'Draft', 'Drama', 'Drawer', 'Drawing', 'Dream', 'Dress', 'Drink', 'Drive', 'Driver', 'Drunk', 'Earth', 'Economics', 'Economy', 'Editor', 'Education', 'Effect', 'Effective', 'Efficiency', 'Effort', 'Election', 'Elevator', 'Emergency', 'Emotion', 'Emphasis', 'Employ', 'Employee', 'Employer', 'Employment', 'Energy', 'Engine', 'Engineer', 'Engineering', 'Entertainment', 'Enthusiasm', 'Entrance', 'Entry', 'Environment', 'Equal', 'Equipment', 'Equivalent', 'Error', 'Escape', 'Essay', 'Establishment', 'Estate', 'Estimate', 'Evening', 'Event', 'Evidence', 'Examination', 'Example', 'Exchange', 'Excitement', 'Excuse', 'Exercise', 'Experience', 'Expert', 'Explanation', 'Expression', 'Extension', 'Extent', 'External', 'Extreme', 'Factor', 'Failure', 'Familiar', 'Family', 'Farmer', 'Father', 'Fault', 'Feature', 'Feedback', 'Feeling', 'Female', 'Field', 'Fight', 'Figure', 'Final', 'Finance', 'Finding', 'Finger', 'Finish', 'Fishing', 'Flight', 'Floor', 'Flower', 'Focus', 'Following', 'Football', 'Force', 'Forever', 'Formal', 'Fortune', 'Foundation', 'Frame', 'Freedom', 'Friend', 'Friendship', 'Front', 'Fruit', 'Function', 'Funeral', 'Funny', 'Future', 'Garage', 'Garbage', 'Garden', 'Gather', 'General', 'Girlfriend', 'Glass', 'Glove', 'Government', 'Grade', 'Grand', 'Grandfather', 'Grandmother', 'Grass', 'Great', 'Green', 'Grocery', 'Ground', 'Group', 'Growth', 'Guarantee', 'Guard', 'Guess', 'Guest', 'Guidance', 'Guide', 'Guitar', 'Habit', 'Handle', 'Health', 'Hearing', 'Heart', 'Heavy', 'Height', 'Hello', 'Highlight', 'Highway', 'Historian', 'History', 'Holiday', 'Homework', 'Honey', 'Horror', 'Horse', 'Hospital', 'Hotel', 'House', 'Housing', 'Human', 'Hurry', 'Husband', 'Ideal', 'Illegal', 'Image', 'Imagination', 'Impact', 'Implement', 'Importance', 'Impress', 'Impression', 'Improvement', 'Incident', 'Income', 'Increase', 'Independence', 'Independent', 'Indication', 'Individual', 'Industry', 'Inevitable', 'Inflation', 'Influence', 'Information', 'Initial', 'Initiative', 'Injury', 'Insect', 'Inside', 'Inspection', 'Inspector', 'Instance', 'Instruction', 'Insurance', 'Intention', 'Interaction', 'Interest', 'Internal', 'International', 'Internet', 'Interview', 'Introduction', 'Investment', 'Invite', 'Island', 'Issue', 'Jacket', 'Joint', 'Judge', 'Judgment', 'Juice', 'Junior', 'Kitchen', 'Knife', 'Knowledge', 'Ladder', 'Landscape', 'Language', 'Laugh', 'Lawyer', 'Layer', 'Leader', 'Leadership', 'Leading', 'League', 'Leather', 'Leave', 'Lecture', 'Length', 'Lesson', 'Letter', 'Level', 'Library', 'Light', 'Limit', 'Listen', 'Literature', 'Living', 'Local', 'Location', 'Lunch', 'Machine', 'Magazine', 'Maintenance', 'Major', 'Management', 'Manager', 'Manner', 'Manufacturer', 'March', 'Market', 'Marketing', 'Marriage', 'Master', 'Match', 'Material', 'Matter', 'Maximum', 'Maybe', 'Meaning', 'Measurement', 'Media', 'Medicine', 'Medium', 'Meeting', 'Member', 'Membership', 'Memory', 'Mention', 'Message', 'Metal', 'Method', 'Middle', 'Midnight', 'Might', 'Minimum', 'Minor', 'Minute', 'Mirror', 'Mission', 'Mistake', 'Mixture', 'Mobile', 'Model', 'Moment', 'Money', 'Monitor', 'Month', 'Morning', 'Mortgage', 'Mother', 'Motor', 'Mountain', 'Mouse', 'Mouth', 'Movie', 'Muscle', 'Music', 'Nasty', 'Nation', 'National', 'Native', 'Natural', 'Nature', 'Necessary', 'Negative', 'Negotiation', 'Nerve', 'Network', 'Newspaper', 'Night', 'Nobody', 'Noise', 'Normal', 'North', 'Nothing', 'Notice', 'Novel', 'Number', 'Nurse', 'Object', 'Objective', 'Obligation', 'Occasion', 'Offer', 'Office', 'Officer', 'Official', 'Opening', 'Operation', 'Opinion', 'Opportunity', 'Opposite', 'Option', 'Orange', 'Order', 'Ordinary', 'Organization', 'Original', 'Other', 'Outcome', 'Outside', 'Owner', 'Package', 'Paint', 'Painting', 'Panic', 'Paper', 'Parent', 'Parking', 'Particular', 'Partner', 'Party', 'Passage', 'Passenger', 'Passion', 'Patience', 'Patient', 'Pattern', 'Pause', 'Payment', 'Peace', 'Penalty', 'Pension', 'People', 'Percentage', 'Perception', 'Performance', 'Period', 'Permission', 'Permit', 'Person', 'Personal', 'Personality', 'Perspective', 'Phase', 'Philosophy', 'Phone', 'Photo', 'Phrase', 'Physical', 'Physics', 'Piano', 'Picture', 'Piece', 'Pitch', 'Pizza', 'Place', 'Plane', 'Plant', 'Plastic', 'Plate', 'Platform', 'Player', 'Pleasure', 'Plenty', 'Poetry', 'Point', 'Police', 'Policy', 'Politics', 'Pollution', 'Population', 'Position', 'Positive', 'Possession', 'Possibility', 'Possible', 'Potato', 'Potential', 'Pound', 'Power', 'Practice', 'Preference', 'Preparation', 'Presence', 'Present', 'Presentation', 'President', 'Press', 'Pressure', 'Price', 'Pride', 'Priest', 'Primary', 'Principle', 'Print', 'Prior', 'Priority', 'Private', 'Prize', 'Problem', 'Procedure', 'Process', 'Produce', 'Product', 'Profession', 'Professional', 'Professor', 'Profile', 'Profit', 'Program', 'Progress', 'Project', 'Promise', 'Promotion', 'Prompt', 'Proof', 'Property', 'Proposal', 'Protection', 'Psychology', 'Public', 'Punch', 'Purchase', 'Purple', 'Purpose', 'Quality', 'Quantity', 'Quarter', 'Queen', 'Question', 'Quiet', 'Quote', 'Radio', 'Raise', 'Range', 'Ratio', 'Reach', 'Reaction', 'Reading', 'Reality', 'Reason', 'Reception', 'Recipe', 'Recognition', 'Recommendation', 'Record', 'Recording', 'Recover', 'Reference', 'Reflection', 'Refrigerator', 'Refuse', 'Region', 'Register', 'Regret', 'Regular', 'Relation', 'Relationship', 'Relative', 'Release', 'Relief', 'Remote', 'Remove', 'Repair', 'Repeat', 'Replacement', 'Reply', 'Report', 'Representative', 'Republic', 'Reputation', 'Request', 'Requirement', 'Research', 'Reserve', 'Resident', 'Resist', 'Resolution', 'Resolve', 'Resort', 'Resource', 'Respect', 'Respond', 'Response', 'Responsibility', 'Restaurant', 'Result', 'Return', 'Reveal', 'Revenue', 'Review', 'Revolution', 'Reward', 'River', 'Rough', 'Round', 'Routine', 'Royal', 'Safety', 'Salad', 'Salary', 'Sample', 'Sandwich', 'Satisfaction', 'Savings', 'Scale', 'Scene', 'Schedule', 'Scheme', 'School', 'Science', 'Score', 'Scratch', 'Screen', 'Screw', 'Script', 'Search', 'Season', 'Second', 'Secret', 'Secretary', 'Section', 'Sector', 'Security', 'Selection', 'Senior', 'Sense', 'Sensitive', 'Sentence', 'Series', 'Serve', 'Service', 'Session', 'Setting', 'Shake', 'Shame', 'Shape', 'Share', 'Shelter', 'Shift', 'Shine', 'Shirt', 'Shock', 'Shoot', 'Shopping', 'Shoulder', 'Shower', 'Signal', 'Signature', 'Significance', 'Silly', 'Silver', 'Simple', 'Singer', 'Single', 'Sister', 'Situation', 'Skill', 'Skirt', 'Sleep', 'Slice', 'Slide', 'Smell', 'Smile', 'Smoke', 'Society', 'Software', 'Solid', 'Solution', 'Somewhere', 'Sound', 'Source', 'South', 'Space', 'Spare', 'Speaker', 'Special', 'Specialist', 'Specific', 'Speech', 'Speed', 'Spell', 'Spend', 'Spirit', 'Spiritual', 'Spite', 'Split', 'Sport', 'Spray', 'Spread', 'Spring', 'Square', 'Stable', 'Staff', 'Stage', 'Stand', 'Standard', 'Start', 'State', 'Statement', 'Station', 'Status', 'Steak', 'Steal', 'Stick', 'Still', 'Stock', 'Stomach', 'Storage', 'Store', 'Storm', 'Story', 'Strain', 'Stranger', 'Strategy', 'Street', 'Strength', 'Stress', 'Stretch', 'Strike', 'String', 'Strip', 'Stroke', 'Structure', 'Struggle', 'Student', 'Studio', 'Study', 'Stuff', 'Stupid', 'Style', 'Subject', 'Substance', 'Success', 'Sugar', 'Suggestion', 'Summer', 'Supermarket', 'Support', 'Surgery', 'Surprise', 'Surround', 'Survey', 'Suspect', 'Sweet', 'Swimming', 'Swing', 'Switch', 'Sympathy', 'System', 'Table', 'Tackle', 'Target', 'Taste', 'Teach', 'Teacher', 'Teaching', 'Technology', 'Telephone', 'Television', 'Temperature', 'Temporary', 'Tennis', 'Tension', 'Thanks', 'Theme', 'Theory', 'Thing', 'Thought', 'Throat', 'Ticket', 'Title', 'Today', 'Tomorrow', 'Tongue', 'Tonight', 'Tooth', 'Topic', 'Total', 'Touch', 'Tough', 'Tourist', 'Towel', 'Tower', 'Track', 'Trade', 'Tradition', 'Traffic', 'Train', 'Trainer', 'Training', 'Transition', 'Transportation', 'Trash', 'Travel', 'Treat', 'Trick', 'Trouble', 'Truck', 'Trust', 'Truth', 'Twist', 'Uncle', 'Understanding', 'Union', 'University', 'Upstairs', 'Usual', 'Vacation', 'Valuable', 'Value', 'Variation', 'Variety', 'Vegetable', 'Vehicle', 'Version', 'Video', 'Village', 'Visit', 'Visual', 'Voice', 'Volume', 'Warning', 'Watch', 'Water', 'Wealth', 'Weather', 'Wedding', 'Weekend', 'Weight', 'Welcome', 'Western', 'Wheel', 'Whole', 'Window', 'Winner', 'Winter', 'Witness', 'Woman', 'Wonder', 'Worker', 'Working', 'World', 'Worry', 'Worth', 'Writer', 'Writing', 'Yeast', 'Yellow', 'Yield', 'Youth', 'Yacht', 'Yodel', 'Zebra', 'Zenith', 'Zigzag', 'Zipper', 'Zircon', 'Zodiac', 'Zombie', 'Zucchini'])];

// countries
export const countries = JSON.parse(String(readFileSync(resolve(__dirname, 'countries.json'))));
